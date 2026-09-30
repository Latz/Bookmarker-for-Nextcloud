// @ts-check
// Persistent storage of the extension, in the IndexedDB database "Bookmarker"
// with the stores:
//   credentials - server, loginname, appPassword
//   options     - all user settings (see DEFAULT_OPTIONS below)
//   misc, hashes - reserved
// Every record has the shape `{ item: <key>, value: <value> }`.
// (The separate cache database is handled in cache.js.)
//
// Options are cached in memory for a short time, because the popup reads many
// of them on every open.
const database = 'Bookmarker';
const dbVersion = 2; // since v0.3 -- bump when a store is added; upgrade steps go in initDatabase

import { openDB, deleteDB } from 'idb';
import { aiProviderDefaults } from './aiProviders.js';
import { cacheDbVersion, initCacheStores } from './cacheSchema.js';

// -----------------------------------------------------------------------
// Options caching for performance (reduce IndexedDB access)
// -----------------------------------------------------------------------

// Cache stores { value, timestamp } objects for per-option expiration
const optionsCache = new Map();
const CACHE_TTL = 30000; // 30 seconds TTL for options cache

// In-flight reads (name -> Promise<value>). A read that has been dispatched but
// not yet resolved is not in optionsCache, so without this a second caller
// (e.g. the popup's prefetch followed by createForm) repeats the IndexedDB get.
const pendingOptions = new Map();

/**
 * Clear the options cache
 * Call this when options are updated
 */
export function clearOptionsCache() {
  optionsCache.clear();
  // A read dispatched before the write may return the old value; don't let
  // later callers join it.
  pendingOptions.clear();
}

// -----------------------------------------------------------------------
// Main DB connection pool
// -----------------------------------------------------------------------

let mainDbConnection = null;
let mainDbConnectionPromise = null;

/** Reset the main DB connection pool — for test isolation only. */
export function _resetMainConnectionForTesting() {
  mainDbConnection = null;
  mainDbConnectionPromise = null;
}

/**
 * Returns the shared connection to the main database, opening it on first use
 * (or again after it was closed/invalidated). Concurrent callers share one
 * pending open. A schema upgrade runs initDatabase.
 * @returns {Promise<import('idb').IDBPDatabase<any>>}
 */
async function getMainDBConnection() {
  if (mainDbConnection) {
    try {
      if (mainDbConnection.objectStoreNames?.contains('options')) {
        return mainDbConnection;
      }
    } catch (error) {
      console.warn(
        '[storage] DB connection invalid, resetting:',
        error.message,
      );
      mainDbConnection = null;
    }
  }

  if (mainDbConnectionPromise) {
    return mainDbConnectionPromise;
  }

  mainDbConnectionPromise = openDB(database, dbVersion, {
    upgrade(db, oldVersion) {
      initDatabase(db, oldVersion).catch((error) => {
        console.error('[storage] database initialisation failed:', error);
      });
    },
    // Another context wants to upgrade/delete the DB: release ours or it waits
    // for this connection (which lives as long as the service worker).
    blocking() {
      mainDbConnection?.close();
      mainDbConnection = null;
    },
    // The browser dropped the connection (e.g. site data cleared). Forget it so
    // the next call reopens instead of failing with InvalidStateError.
    terminated() {
      mainDbConnection = null;
    },
  }).then(
    (db) => {
      mainDbConnection = db;
      mainDbConnectionPromise = null;
      return db;
    },
    (error) => {
      // Don't keep the rejected promise, or every later call would fail with it
      mainDbConnectionPromise = null;
      throw error;
    },
  );

  return mainDbConnectionPromise;
}

// -----------------------------------------------------------------------

/**
 * Loads data from the specified store for the given items.
 *
 * @param {string} storeName - The name of the store to load data from.
 * @param {...any} items - The items to load data for.
 * @return {Promise<any>|any} - A promise that resolves to an object containing the loaded data for each item, or a single value if only one item is provided.
 */
export async function load_data(storeName, ...items) {
  const db = await getMainDBConnection();

  let result = {};

  for (let item of items) {
    // A failed read is treated like a missing record (the catch returns an
    // object without `.value`, so the entry ends up undefined below).
    // NOSONAR: reads are kept sequential on purpose
    const data = await db.get(storeName, item).catch(() => {
      return result;
    });

    result[item] = data !== undefined ? data.value : undefined;
  }

  // if there's only 1 item in the object return the value instead of the object
  if (Object.keys(result).length === 1) {
    return result[Object.keys(result)[0]];
  }

  // Deliberately not logged: this path serves load_data('credentials',
  // 'loginname', 'appPassword'), so any logging here prints the app password.
  return result;
}

// -----------------------------------------------------------------------------------------------------
/**
 * Loads all data from the specified store in the database.
 * @param {string} storeName - The name of the store to load data from.
 * @returns {Promise<Array>} - A promise that resolves with an array of data from the store.
 */
export async function load_data_all(storeName) {
  const db = await getMainDBConnection();

  // The fallback used to reference `result` inside its own initialiser (a
  // ReferenceError whenever getAll rejected).
  return db.getAll(storeName).catch(() => []);
}

// -----------------------------------------------------------------------------------------------------
/**
 * Stores data in the specified store.
 *
 * @param {string} storeName - The name of the store to store the data in.
 * @param {...Object} items - The items to store in the specified store.
 * @return {Promise<void>} - A promise that resolves when the data is successfully stored.
 */
export async function store_data(storeName, ...items) {
  // Deliberately not logged: login.js writes the app password through here.
  const db = await getMainDBConnection();
  const puts = [];
  // Each argument is an object; every key/value pair becomes one record, e.g.
  // store_data('options', { a: 1, b: 2 }) writes {item:'a',value:1} and
  // {item:'b',value:2}. All writes run in parallel.
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      puts.push(db.put(storeName, { item: key, value }));
    }
  }
  await Promise.all(puts);

  // Clear cache if we're updating options, so the next read sees the new value
  if (storeName === 'options') {
    clearOptionsCache();
  }
  // New credentials: the service worker must drop its cached auth header.
  if (storeName === 'credentials') {
    await notifyCredentialsChanged();
  }
}

/**
 * The service worker caches the auth header (and network timeout) for 60 s in
 * module state that other contexts cannot reach. After a login or "forget
 * credentials" it would keep sending the old ones, so tell it to drop them.
 * Best effort: without a listening worker there is nothing to invalidate.
 */
async function notifyCredentialsChanged() {
  try {
    await chrome.runtime.sendMessage({ msg: 'credentialsChanged' });
  } catch {
    // no receiver / not in an extension context
  }
}

// --------------------------------------------------------------------------------
/**
 * Deletes specified items from the given store in the database.
 *
 * @param {string} storeName - The name of the store from which to delete the items.
 * @param {...any} items - The items to be deleted.
 * @return {Promise<void>} - A promise that resolves when the deletion is complete.
 */
export async function delete_data(storeName, ...items) {
  const db = await getMainDBConnection();

  const deletes = [];
  for (let item of items) {
    deletes.push(db.delete(storeName, item).catch(() => {}));
  }
  await Promise.all(deletes);
}

// ----------------------------------------------------------------------------
/**
 * Store a hash in the database with the current timestamp.
 *
 * @param {string} hash - The hash to be stored.
 */
export async function store_hash(hash) {
  const db = await getMainDBConnection();
  await db.put('hashes', { item: hash, value: Date.now() });
}
// -----------------------------------------------------------------------
/**
 * Retrieves the value of the specified option.
 * Cached for performance (30s TTL per option)
 * @param {string} optionName - The name of the option.
 * @returns {any} - The value of the option.
 */
export async function getOption(optionName) {
  // Check cache first
  const now = Date.now();

  if (optionsCache.has(optionName)) {
    const cached = optionsCache.get(optionName);
    // Check if this specific option's cache is still valid
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }
    // Cache expired for this option, remove it
    optionsCache.delete(optionName);
  }

  // Join a read that is already in flight
  if (pendingOptions.has(optionName)) {
    return pendingOptions.get(optionName);
  }

  // Cache miss or expired - fetch from IndexedDB
  const pending = (async () => {
    let data = await load_data('options', optionName);
    // An option that was never stored reads as `false`, so callers can use
    // plain truthiness checks (`if (await getOption('cbx_...'))`).
    if (data === undefined) data = false;

    // Update cache with value and timestamp
    optionsCache.set(optionName, { value: data, timestamp: now });

    return data;
  })().finally(() => {
    if (pendingOptions.get(optionName) === pending) {
      pendingOptions.delete(optionName);
    }
  });
  pendingOptions.set(optionName, pending);

  return pending;
}

/**
 * Get multiple options at once (batched)
 * Much faster than individual getOption calls
 * @param {Array<string>} optionNames - Array of option names to retrieve
 * @returns {Promise<Object>} Object with key-value pairs
 */
export async function getOptions(optionNames) {
  const now = Date.now();
  const result = {};
  const namesToFetch = [];
  const joined = [];

  // Check cache first (per-option expiration)
  for (const name of optionNames) {
    if (optionsCache.has(name)) {
      const cached = optionsCache.get(name);
      // Check if this specific option's cache is still valid
      if (now - cached.timestamp < CACHE_TTL) {
        result[name] = cached.value;
        continue;
      }
      // Cache expired for this option, will refetch
      optionsCache.delete(name);
    }
    // Already being read by another caller: wait for that read instead
    if (pendingOptions.has(name)) {
      joined.push(
        pendingOptions.get(name).then((value) => {
          result[name] = value;
        }),
      );
      continue;
    }
    namesToFetch.push(name);
  }

  // Fetch missing/expired options from IndexedDB (truly batched with parallel gets)
  if (namesToFetch.length > 0) {
    const batch = (async () => {
      const db = await getMainDBConnection();
      // Fetch all options in parallel using Promise.all
      return Promise.all(
        namesToFetch.map((name) =>
          db.get('options', name).catch(() => undefined),
        ),
      );
    })();

    // Publish each name as pending so concurrent callers can join, and update
    // the cache with per-option timestamps as the batch resolves
    namesToFetch.forEach((name, index) => {
      const pending = batch
        .then((results) => {
          const data = results[index];
          const value = data !== undefined ? data.value : false;
          optionsCache.set(name, { value, timestamp: now });
          return value;
        })
        .finally(() => {
          if (pendingOptions.get(name) === pending) {
            pendingOptions.delete(name);
          }
        });
      pendingOptions.set(name, pending);
      joined.push(
        pending.then((value) => {
          result[name] = value;
        }),
      );
    });
  }

  await Promise.all(joined);

  return result;
}
// ---------------------------------------------------------------------
/**
 * Initialize the necessary object stores in the given database.
 * Must run inside an upgrade transaction (createObjectStore is only allowed there).
 * @param {IDBDatabase} db - The database to initialize the object stores in.
 */
async function InitializeStores(db) {
  try {
    db.createObjectStore('credentials', { keyPath: 'item' });
    db.createObjectStore('options', { keyPath: 'item' });
    db.createObjectStore('misc', { keyPath: 'item' });
    db.createObjectStore('hashes', { keyPath: 'item' });
  } catch (e) {
    console.log(e);
  }
}
// ---------------------------------------------------------------------
/**
 * Clears stored data. Resolves only once everything is really cleared (and, for
 * options, the defaults are back), so callers can safely refresh their UI.
 * @param {'all' | 'options' | 'credentials' | 'cache'} subject
 */
export async function clearData(subject) {
  if (subject === 'cache') {
    const cache_db = await openDB('BookmarkerCache', cacheDbVersion, {
      upgrade: initCacheStores,
    });
    try {
      // bookmarkChecks too, or stale duplicate-check results survive a "clear cache"
      await Promise.all([
        cache_db.clear('folders'),
        cache_db.clear('keywords'),
        cache_db.clear('bookmarkChecks'),
      ]);
    } finally {
      cache_db.close();
    }
    return;
  }

  // The pooled connection is used (rather than a second, never-closed one), so
  // the clears and the initDefaults() below are ordered on the same connection.
  const db = await getMainDBConnection();
  const stores = {
    all: ['credentials', 'options', 'misc', 'hashes'],
    options: ['options'],
    credentials: ['credentials'],
  }[subject];
  if (!stores) return;

  await Promise.all(stores.map((store) => db.clear(store)));

  clearOptionsCache();
  // An emptied options store would make every option read back as false.
  if (stores.includes('options')) await initDefaults();
  if (stores.includes('credentials')) await notifyCredentialsChanged();
}
// -----------------------------------------------------------------------
/**
 * Runs the schema setup/migration when the 'Bookmarker' database is created
 * or upgraded.
 * @param {IDBDatabase} db - The database being upgraded.
 * @param {number} oldVersion - The version before the upgrade (0 = new install).
 * @returns {Promise<void>}
 */
export async function initDatabase(db, oldVersion) {
  console.log('oldversion', oldVersion);

  //--- Clean installation
  if (oldVersion === 0) {
    console.log('freshstart');
    await InitializeStores(db);
    await initDefaults();
  }
  //---  v0.16
  if (oldVersion === 1) {
    // copy data from old version
    const cbx_autoDesc = await load_data('options', 'cbx_autoDesc');
    const cbx_autoTags = await load_data('options', 'cbx_autoTags');
    const cbx_displayFolders = await load_data('options', 'cbx_displayFolders');
    // set default values for new version
    await initDefaults();
    // restore data from previous version
    await store_data('options', { cbx_autoTags: cbx_autoTags });
    await store_data('options', { cbx_displayFolders: cbx_displayFolders });
    await store_data('options', { cbx_autoDescription: cbx_autoDesc });
    // delete old data name
    await delete_data('options', 'cbx_autoDesc');
  }
}

// -----------------------------------------------------------------------
/**
 * Writes every default option, overwriting the stored values (used on a fresh
 * install and by "Reset options").
 * @returns {Promise<void>}
 */
export function initDefaults() {
  // One store_data call: it already iterates Object.entries internally and
  // issues the puts in parallel, so this is a single pass over one connection
  // instead of 20 sequential round trips.
  return store_data('options', DEFAULT_OPTIONS);
}

/**
 * Adds every default option that is missing, leaving existing values alone.
 * Runs on service worker start: the database version is not bumped when new
 * options are introduced, so users who updated from an older release would
 * otherwise never get them and the features would stay silently off.
 * @returns {Promise<void>}
 */
export async function ensureDefaults() {
  const db = await getMainDBConnection();
  const existing = new Set(await db.getAllKeys('options'));
  const missing = Object.fromEntries(
    Object.entries(DEFAULT_OPTIONS).filter(([key]) => !existing.has(key)),
  );
  if (Object.keys(missing).length > 0) {
    await store_data('options', missing);
  }
}

// Default value of every option. Naming convention: cbx_ = checkbox (boolean),
// input_ = text/number field, select_ = dropdown; the rest are internal values.
// A new option must be added here so that ensureDefaults() can supply it to
// existing installs.
const DEFAULT_OPTIONS = {
  cbx_showUrl: true,
  cbx_showDescription: true,
  cbx_autoDescription: true,
  cbx_showKeywords: true,
  cbx_successMessage: true,
  cbx_alreadyStored: true,
  cbx_autoTags: true,
  input_headings_slider: 3,
  input_networkTimeout: 10,
  input_numberOfRetries: 5,
  cbx_reduceKeywords: true,
  folderIDs: ['-1'], // Default to root folder
  zenFolderIDs: ['-1'], // Default to root folder

  // Zen mode options
  cbx_enableZen: false, // Zen mode disabled by default
  cbx_zenDisplayNotification: true, // Show notifications in zen mode by default

  // Enhanced duplicate checking options
  cbx_fuzzyUrlMatch: true, // Normalize URLs to catch variants
  cbx_cacheBookmarkChecks: true, // Cache bookmark duplicate checks
  input_bookmarkCacheTTL: 10, // Cache TTL in minutes
  select_duplicateStrategy: 'update_existing', // Default duplicate handling
  cbx_titleSimilarityCheck: false, // Title similarity check (off by default)
  input_titleSimilarityThreshold: 75, // Title similarity threshold (0-100)
  input_titleCheckLimit: 20, // Limit bookmarks fetched for title check (performance)

  // AI options (see aiClient.js)
  select_aiProvider: 'off', // 'off' or an id from aiProviders.js
  ...aiProviderDefaults(), // input_<id>ApiKey / Model / BaseUrl per provider
  cbx_aiTags: false,
  cbx_aiDescription: false,
  cbx_zenUseAi: false, // Zen mode: ask the AI for missing tags/description
};

// -----------------------------------------------------------------------

/**
 * Development helper: deletes the real databases and, for version 1, recreates
 * the old schema with fake credentials, to test the upgrade path in
 * initDatabase. Destructive -- the options page only offers it in dev builds.
 * @param {number} [version] - The schema version to recreate (only 1 is supported).
 * @returns {Promise<void>}
 */
export async function createOldDatabase(version) {
  await deleteDB('Bookmarker');
  await deleteDB('Cache');

  if (version === 1) {
    let db = await openDB('Bookmarker', 1, {
      upgrade(db) {
        InitializeStores(db);
      },
    });
    void db.put('credentials', {
      item: 'appPassword',
      value: 'ThisistheApppassword',
    });
    void db.put('credentials', { item: 'loginname', value: 'admin' });
    void db.put('credentials', {
      item: 'server',
      value: 'https://pascal:9025',
    });
    void db.put('options', { item: 'cbx_autoDesc', value: true });
    void db.put('options', { item: 'cbx_autoTags', value: true });
    void db.put('options', { item: 'cbx_displayFolders', value: true });

    void openDB('Cache', dbVersion, {
      upgrade(db) {
        db.createObjectStore('folders', { keyPath: 'item' });
        db.createObjectStore('tags', { keyPath: 'item' });
      },
    });
  }
}
