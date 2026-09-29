// @ts-check
// Local cache (IndexedDB database "BookmarkerCache") for data that is expensive
// to get from the Nextcloud server:
//   - keywords / folders: cached for 24 hours (cacheGet / cacheAdd)
//   - bookmarkChecks: "is this URL already bookmarked?" results, cached for a
//     configurable number of minutes (cacheBookmarkCheck & co)
// The database schema lives in cacheSchema.js.
import { openDB } from 'idb';
import apiCall from './apiCall.js';
import { preRenderFolders } from '../background/modules/bookmarks/getFolders.js';
import { cacheRefreshNotification } from '../background/modules/browser/notification.js';
import { getOption } from './storage.js';
import { cacheDbVersion, initCacheStores } from './cacheSchema.js';

const dbName = 'BookmarkerCache';

// Connection pool for IndexedDB to avoid repeated open/close
let dbConnectionPool = null;
let dbConnectionPromise = null;

// Idle timeout for automatic connection cleanup
let connectionIdleTimeout = null;
const CONNECTION_IDLE_TIME = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------
/**
 * Returns the cached list for `type`, loading it from the server if there is
 * no usable cache entry (missing, in an outdated format or older than 24h).
 *
 * Each entry is stored as two records in its store: `{item: type, value}` with
 * the data and `{item: '<type>_created', value: timestamp}` for expiry.
 *
 * @param {'keywords'|'folders'} type - Which list to read.
 * @param {boolean} [forceServer] - Skip the cache and refetch (manual refresh).
 * @returns {Promise<Array<any>>} The list, or [] if the server call failed.
 */
export async function cacheGet(type, forceServer = false) {
  const db = await getDBConnection();

  // OPTIMIZATION: Fetch both in parallel instead of sequentially
  const [element, created] = await Promise.all([
    db.get(type, type),
    db.get(type, `${type}_created`),
  ]);

  // Folders used to be cached as a pre-rendered HTML string. That format is
  // gone (the titles inside it were never escaped), so any surviving string
  // entry is discarded and refetched rather than handed to callers that now
  // expect option descriptors. Entries live for 24h, so this matters for
  // anyone upgrading mid-cache.
  // Keywords entries written before failed fetches stopped being cached can
  // hold `undefined`; treat any non-array value as a miss so they self-heal.
  const staleFormat =
    (type === 'folders' || type === 'keywords') &&
    element &&
    !Array.isArray(element.value);

  // data was not found in cache -> load from server
  if (
    element === undefined ||
    Object.keys(element).length === 0 ||
    staleFormat ||
    elementExpired(db, type, created, forceServer)
  ) {
    // We call it "keywords" Nextcloud calls it "tags" -> convert
    const datatype = type === 'keywords' ? 'tag' : 'folder';
    const response = await apiCall(
      `index.php/apps/bookmarks/public/rest/v2/${datatype}`,
      'GET',
    );
    // The tag endpoint returns a bare array; the folder endpoint wraps it in
    // { status, data }.
    const payload = Array.isArray(response) ? response : response.data;
    // A failed apiCall resolves to a status/statusText object with no array.
    // Caching that would poison this entry for 24h, so return empty and let
    // the next call retry the server.
    if (!Array.isArray(payload)) {
      return [];
    }
    const data = type === 'folders' ? preRenderFolders(payload) : payload;
    // The data is already in hand; a failed cache write must not fail the read.
    await cacheAdd(type, data).catch((error) => {
      console.error(`Error caching ${type}:`, error);
    });
    if (forceServer) cacheRefreshNotification();
    return data;
  } else {
    // data was found in cache -> return cache elements
    return element.value;
  }
}

// ---------------------------------------------------------------------
/**
 * Stores a list in the cache and stamps it with the current time (which
 * starts its 24h lifetime).
 * @param {'keywords'|'folders'} type
 * @param {Array<any>} data
 * @returns {Promise<void>}
 */
export async function cacheAdd(type, data) {
  const db = await getDBConnection();

  // OPTIMIZATION: Batch both writes in parallel
  await Promise.all([
    db.put(type, { item: type, value: data }),
    db.put(type, { item: `${type}_created`, value: Date.now() }),
  ]);
}

// ---------------------------------------------------------------------
/**
 * If the user enters a tag that's not already in the tags collection,
 * add it to the local cache (so it is suggested next time without waiting for
 * the server list to be refetched). The creation time is not touched, so the
 * entry still expires on schedule.
 * @param {'keywords'} type
 * @param {Array<string>} newTags
 * @returns {Promise<void>}
 */
export function cacheTempAdd(type, newTags) {
  // Read-modify-write, so two overlapping calls (e.g. a popup save and a zen
  // mode save) would both read the same list and the later write would drop the
  // earlier one's tags. Calls are queued instead; they all run in the service
  // worker, so an in-process queue is enough to make each one atomic.
  const run = tempAddQueue.then(() => addTempTags(type, newTags));
  tempAddQueue = run.catch(() => {}); // a failed call must not block the next
  return run;
}

// Tail of the queue of pending cacheTempAdd calls.
let tempAddQueue = Promise.resolve();

/**
 * The actual read-modify-write behind cacheTempAdd: merges the new tags into
 * the cached list (duplicates ignored, case-insensitively) and stores it sorted.
 * @param {string} type
 * @param {Array<string>} newTags
 * @returns {Promise<void>}
 */
async function addTempTags(type, newTags) {
  const cachedTags = await cacheGet(type);
  // case-insensitive, like the caller's own check: concurrent saves of the same
  // new tag must not leave it in the list twice
  const known = new Set(cachedTags.map((tag) => String(tag).toLowerCase()));
  const added = [];
  for (const tag of newTags) {
    const key = String(tag).toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    added.push(tag);
  }
  const db = await getDBConnection();
  await db.put(type, { item: type, value: cachedTags.concat(added).sort() });
}

// ---------------------------------------------------------------------
/**
 * Whether a cache entry has to be refetched: always when forced or when it
 * has no creation record, and when it is older than 24 hours (in which case
 * the stale records are also deleted in the background).
 * @param {any} db - Open database.
 * @param {string} type - Store name.
 * @param {{value: number}|undefined} created - The `<type>_created` record.
 * @param {boolean} forceServer
 * @returns {boolean}
 */
function elementExpired(db, type, created, forceServer) {
  // if the refresh is forced or no entry has been created, return true
  // fetch can be forced by setting forceServer to true
  if (forceServer || created === undefined) return true;

  const one_day = 60 * 60 * 24 * 1000; // one day in milliseconds
  const diff = Date.now() - created.value;
  if (diff > one_day) {
    // remove entry
    // Best effort: the caller refetches either way.
    Promise.all([
      db.delete(type, type),
      db.delete(type, `${type}_created`),
    ]).catch((error) => {
      console.warn(`Could not remove expired ${type} cache entry:`, error);
    });
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
      if (dbConnectionPool.objectStoreNames?.contains('bookmarkChecks')) {
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
  dbConnectionPromise = openDB(dbName, cacheDbVersion, {
    upgrade: initCacheStores,
    // Another context (e.g. the options page's "clear cache") wants to upgrade
    // or delete the DB: release ours. The next call reopens.
    blocking() {
      closeDBConnection();
    },
    // The browser dropped the connection (e.g. site data cleared).
    terminated() {
      dbConnectionPool = null;
    },
  }).then(
    (db) => {
      dbConnectionPool = db;
      dbConnectionPromise = null;
      return db;
    },
    (error) => {
      // Without this the rejected promise stays cached and every later call
      // gets it back until the idle timer fires (storage.js does the same).
      dbConnectionPromise = null;
      throw error;
    },
  );

  return dbConnectionPromise;
}

// ---------------------------------------------------------------------
// Bookmark Check Caching Functions
// ---------------------------------------------------------------------

// LRU cache for hash calculations (max 100 entries)
const hashCache = new Map();
const MAX_HASH_CACHE_SIZE = 100;

/**
 * Convert URL to a safe cache key
 * Uses fast hash for better performance with LRU caching
 * @param {string} url - The URL (should be normalized already)
 * @returns {string} Safe cache key
 */
function hashUrl(url) {
  // Check cache first
  if (hashCache.has(url)) {
    const cached = hashCache.get(url);
    // Move to end (LRU)
    hashCache.delete(url);
    hashCache.set(url, cached);
    return cached;
  }

  // Fast hash using simple string hash algorithm (the classic `hash * 31 + char`,
  // as in Java's String.hashCode). It is not collision-free, which is why the
  // URL length is appended to the key below and the full URL is stored with
  // each record.
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.codePointAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to base36 for compact string representation
  const cacheKey = `url_${Math.abs(hash).toString(36)}_${url.length}`;

  // Add to cache (LRU eviction)
  if (hashCache.size >= MAX_HASH_CACHE_SIZE) {
    // Remove oldest entry (first item in Map)
    const firstKey = hashCache.keys().next().value;
    hashCache.delete(firstKey);
  }
  hashCache.set(url, cacheKey);

  return cacheKey;
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
    // OPTIMIZATION: Calculate hash while DB connection is being established (parallel)
    const cacheKey = hashUrl(url);
    const db = await getDBConnection();

    await db.put('bookmarkChecks', {
      item: cacheKey,
      url: url,
      value: result,
      timestamp: Date.now(), // Faster than new Date().getTime()
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
    // OPTIMIZATION: Calculate hash while DB connection is being established (parallel)
    const cacheKey = hashUrl(url);
    const db = await getDBConnection();
    const cached = await db.get('bookmarkChecks', cacheKey);

    // Don't close - keep connection pooled

    if (!cached) return null;

    // Check TTL (in minutes) - use pre-fetched option if available
    const ttl =
      (options?.input_bookmarkCacheTTL ??
        (await getOption('input_bookmarkCacheTTL'))) ||
      10;
    const age = (Date.now() - cached.timestamp) / 60000; // Convert to minutes (Date.now() is faster)

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
// (the guard keeps the module importable in tests, where `chrome` is absent).
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onSuspend?.addListener(() => {
    closeDBConnection();
  });
}
