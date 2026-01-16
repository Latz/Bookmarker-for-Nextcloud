import { openDB } from 'idb';
import apiCall from './apiCall.js';
import { preRenderFolders } from '../background/modules/getFolders.js';
import { cacheRefreshNotification } from '../background/modules/notification.js';
import { getOption } from './storage.js';

const dbName = 'BookmarkerCache';
const dbVersion = 3; // Incremented for bookmarkChecks store

// Connection pool for IndexedDB to avoid repeated open/close
let dbConnectionPool = null;
let dbConnectionPromise = null;

// Idle timeout for automatic connection cleanup
let connectionIdleTimeout = null;
const CONNECTION_IDLE_TIME = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------
export async function cacheGet(type, forceServer = false) {
  const db = await openDB(dbName, dbVersion, {
    upgrade(db) {
      // there's no way to add a store to an existing database
      // without upgrading it, so the creation needs to done
      // with explicit names.
      try {
        db.createObjectStore('keywords', { keyPath: 'item' });
        db.createObjectStore('folders', { keyPath: 'item' });
        db.createObjectStore('bookmarkChecks', { keyPath: 'item' });
      } catch (e) {
        console.log(e);
      }
    },
  });

  const element = await db.get(type, type);
  const created = await db.get(type, `${type}_created`);

  // data was not found in cache -> load from server
  if (
    typeof element === 'undefined' ||
    Object.keys(element).length === 0 ||
    elementExpired(db, type, created, forceServer)
  ) {
    // We call it "keywords" Nextcloud calls it "tags" -> convert
    const datatype = type === 'keywords' ? 'tag' : 'folder';
    let data = await apiCall(
      `index.php/apps/bookmarks/public/rest/v2/${datatype}`,
      'GET',
    );
    if (type === 'folders') {
      data = preRenderFolders(data.data);
    }
    cacheAdd(type, data);
    if (forceServer) cacheRefreshNotification();
    return data;
  } else {
    // data was found in cache -> return cache elements
    return element.value;
  }
}

// ---------------------------------------------------------------------
export async function cacheAdd(type, data) {
  const db = await openDB(dbName, dbVersion, {
    upgrade(db) {
      db.createObjectStore(type, { keyPath: 'item' });
    },
  });

  db.put(type, { item: type, value: data });
  db.put(type, { item: `${type}_created`, value: new Date().getTime() });
}

// ---------------------------------------------------------------------
// If the user enters a tag that's not already in the tags collection,
// add it to the local cache
export async function cacheTempAdd(type, newTags) {
  const db = await openDB(dbName, dbVersion, {
    upgrade(db) {
      db.createObjectStore(type, { keyPath: 'item' });
    },
  });

  let cachedTags = await cacheGet(type);
  let allTags = cachedTags.concat(newTags);
  db.put(type, { item: type, value: allTags.sort() });
}

// ---------------------------------------------------------------------
function elementExpired(db, type, created, forceServer) {
  // if the refresh is forced or no entry has been created, return true
  // fetch can be forced by setting forceServer to true
  if (forceServer || typeof created === 'undefined') return true;

  const one_day = 60 * 60 * 24 * 1000; // one day in milliseconds
  const diff = new Date().getTime() - created.value;
  if (diff > one_day) {
    // remove entry
    db.delete(type, type);
    db.delete(type, `${type}_created`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// IndexedDB Connection Pool
// ---------------------------------------------------------------------

/**
 * Get or create a database connection (connection pooling)
 * Automatically closes connection after 5 minutes of inactivity
 * @returns {Promise<IDBDatabase>} Database connection
 */
async function getDBConnection() {
  // Reset idle timeout - connection is being used
  clearTimeout(connectionIdleTimeout);
  connectionIdleTimeout = setTimeout(() => {
    closeDBConnection();
  }, CONNECTION_IDLE_TIME);

  // If we already have a connection, validate and return it
  if (dbConnectionPool) {
    try {
      // Validate connection is still valid by checking for expected object stores
      if (
        dbConnectionPool.objectStoreNames &&
        dbConnectionPool.objectStoreNames.contains('bookmarkChecks')
      ) {
        return dbConnectionPool;
      }
    } catch (e) {
      // Connection is stale or invalid, reset it
      console.warn('Stale IndexedDB connection detected, recreating:', e);
      dbConnectionPool = null;
    }
  }

  // If a connection is being established, wait for it
  if (dbConnectionPromise) {
    return dbConnectionPromise;
  }

  // Create new connection
  dbConnectionPromise = openDB(dbName, dbVersion, {
    upgrade(db) {
      try {
        db.createObjectStore('keywords', { keyPath: 'item' });
        db.createObjectStore('folders', { keyPath: 'item' });
        db.createObjectStore('bookmarkChecks', { keyPath: 'item' });
      } catch (e) {
        console.log(e);
      }
    },
  }).then((db) => {
    dbConnectionPool = db;
    dbConnectionPromise = null;
    return db;
  });

  return dbConnectionPromise;
}

// ---------------------------------------------------------------------
// Bookmark Check Caching Functions
// ---------------------------------------------------------------------

/**
 * Convert URL to a safe cache key
 * Uses fast hash for better performance
 * @param {string} url - The URL (should be normalized already)
 * @returns {string} Safe cache key
 */
function hashUrl(url) {
  // Fast hash using simple string hash algorithm
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to base36 for compact string representation
  return `url_${Math.abs(hash).toString(36)}_${url.length}`;
}

/**
 * Cache a bookmark check result
 * Uses connection pooling for better performance
 * @param {string} url - The URL that was checked (should be normalized)
 * @param {Object} result - The check result to cache
 * @param {Object} options - Optional pre-fetched options object with cbx_cacheBookmarkChecks
 */
export async function cacheBookmarkCheck(url, result, options = null) {
  // Use pre-fetched options if available, otherwise fetch
  const cacheEnabled =
    options?.cbx_cacheBookmarkChecks ??
    (await getOption('cbx_cacheBookmarkChecks'));
  if (!cacheEnabled) return;

  try {
    const db = await getDBConnection();
    const cacheKey = hashUrl(url);

    await db.put('bookmarkChecks', {
      item: cacheKey,
      url: url,
      value: result,
      timestamp: new Date().getTime(),
    });

    // Don't close - keep connection pooled
  } catch (error) {
    console.error('Failed to cache bookmark check:', error);
  }
}

/**
 * Get cached bookmark check result
 * Uses connection pooling for better performance
 * @param {string} url - The URL to look up (should be normalized)
 * @param {Object} options - Optional pre-fetched options object with cbx_cacheBookmarkChecks and input_bookmarkCacheTTL
 * @returns {Object|null} Cached result or null if not found/expired
 */
export async function getCachedBookmarkCheck(url, options = null) {
  // Use pre-fetched options if available, otherwise fetch
  const cacheEnabled =
    options?.cbx_cacheBookmarkChecks ??
    (await getOption('cbx_cacheBookmarkChecks'));
  if (!cacheEnabled) return null;

  try {
    const db = await getDBConnection();
    const cacheKey = hashUrl(url);
    const cached = await db.get('bookmarkChecks', cacheKey);

    // Don't close - keep connection pooled

    if (!cached) return null;

    // Check TTL (in minutes) - use pre-fetched option if available
    const ttl =
      (options?.input_bookmarkCacheTTL ??
        (await getOption('input_bookmarkCacheTTL'))) ||
      10;
    const age = (new Date().getTime() - cached.timestamp) / 60000; // Convert to minutes

    if (age > ttl) {
      // Expired - delete and return null (async, don't wait)
      invalidateBookmarkCache(url).catch(console.error);
      return null;
    }

    return cached.value;
  } catch (error) {
    console.error('Failed to get cached bookmark check:', error);
    return null;
  }
}

/**
 * Invalidate (delete) cached bookmark check for a URL
 * Uses connection pooling for better performance
 * @param {string} url - The URL to invalidate (should be normalized)
 */
export async function invalidateBookmarkCache(url) {
  try {
    const db = await getDBConnection();
    const cacheKey = hashUrl(url);
    await db.delete('bookmarkChecks', cacheKey);
    // Don't close - keep connection pooled
  } catch (error) {
    console.error('Failed to invalidate bookmark cache:', error);
  }
}

/**
 * Clear all bookmark check cache
 * Uses connection pooling for better performance
 */
export async function clearBookmarkCheckCache() {
  try {
    const db = await getDBConnection();
    await db.clear('bookmarkChecks');
    // Don't close - keep connection pooled
  } catch (error) {
    console.error('Failed to clear bookmark check cache:', error);
  }
}

/**
 * Close the database connection pool
 * Call this when the extension is being unloaded
 */
export function closeDBConnection() {
  // Clear any pending idle timeout
  clearTimeout(connectionIdleTimeout);
  connectionIdleTimeout = null;

  if (dbConnectionPool) {
    dbConnectionPool.close();
    dbConnectionPool = null;
  }
  dbConnectionPromise = null;
}

// ---------------------------------------------------------------------
// Automatic cleanup on extension unload
// ---------------------------------------------------------------------

// Register cleanup handler for when extension is suspended/unloaded
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onSuspend?.addListener(() => {
    closeDBConnection();
  });
}
