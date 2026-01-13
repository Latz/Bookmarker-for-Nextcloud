const database = 'Bookmarker';
const dbVersion = 2; // since v0.3

import { openDB, deleteDB } from 'idb';

// -----------------------------------------------------------------------
// Options caching for performance (reduce IndexedDB access)
// -----------------------------------------------------------------------

// Cache stores { value, timestamp } objects for per-option expiration
const optionsCache = new Map();
const CACHE_TTL = 30000; // 30 seconds TTL for options cache

/**
 * Clear the options cache
 * Call this when options are updated
 */
export function clearOptionsCache() {
  optionsCache.clear();
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
  const db = await openDB(database, dbVersion, {
    upgrade(db, dbVersion) {
      console.log('upgrade', dbVersion);
      initDatabase(db, dbVersion);
    },
  });

  let result = {};

  for (let item of items) {
    const data = await db.get(storeName, item).catch(() => {
      return result;
    });

    result[item] = data !== undefined ? data.value : undefined;
  }
  db.close();

  // if there's only 1 item in the object return the value instead of the object
  if (Object.keys(result).length === 1) {
    return result[Object.keys(result)[0]];
  }

  console.log('load_data', storeName, items, result);

  return Promise.resolve(result);
}

// -----------------------------------------------------------------------------------------------------
/**
 * Loads all data from the specified store in the database.
 * @param {string} storeName - The name of the store to load data from.
 * @returns {Promise<Array>} - A promise that resolves with an array of data from the store.
 */
export async function load_data_all(storeName) {
  // Open the database connection
  const db = await openDB(database, dbVersion, {
    upgrade(db, dbVersion) {
      initDatabase(db, dbVersion);
    },
  });

  // Retrieve all data from the specified store
  const result = await db.getAll(storeName).catch(() => {
    return result;
  });
  db.close();

  return Promise.resolve(result);
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
  console.log('store_data', storeName, items);
  const db = await openDB(database, dbVersion, {
    upgrade(db, dbVersion) {
      initDatabase(db, dbVersion);
    },
  });
  for (let item of items) {
    for (let key in item) {
      db.put(storeName, { item: key, value: item[key] });
    }
  }
  db.close();

  // Clear cache if we're updating options
  if (storeName === 'options') {
    clearOptionsCache();
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
  const db = await openDB(database, dbVersion, {
    upgrade(db, dbVersion) {
      initDatabase(db, dbVersion);
    },
  });

  for (let item of items) {
    db.delete(storeName, item).catch(() => {
      return;
    });
  }
  db.close();
}

// ----------------------------------------------------------------------------
/**
 * Store a hash in the database with the current timestamp.
 *
 * @param {string} hash - The hash to be stored.
 */
export async function store_hash(hash) {
  const db = await openDB(database, dbVersion, {
    upgrade(db, dbVersion) {
      initDatabase(db, dbVersion);
    },
  });

  db.put('hashes', { item: hash, value: new Date().getTime() });
  db.close();
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

  // Cache miss or expired - fetch from IndexedDB
  let data = await load_data('options', optionName);
  if (data === undefined) data = false;

  // Update cache with value and timestamp
  optionsCache.set(optionName, { value: data, timestamp: now });

  return data;
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
    namesToFetch.push(name);
  }

  // Fetch missing/expired options from IndexedDB (truly batched with parallel gets)
  if (namesToFetch.length > 0) {
    const db = await openDB(database, dbVersion, {
      upgrade(db, dbVersion) {
        initDatabase(db, dbVersion);
      },
    });

    // Fetch all options in parallel using Promise.all
    const promises = namesToFetch.map((name) =>
      db.get('options', name).catch(() => undefined),
    );
    const results = await Promise.all(promises);

    // Process results and update cache with per-option timestamps
    namesToFetch.forEach((name, index) => {
      const data = results[index];
      const value = data !== undefined ? data.value : false;
      result[name] = value;
      optionsCache.set(name, { value, timestamp: now });
    });

    db.close();
  }

  return result;
}
// ---------------------------------------------------------------------
/**
 * Initialize the necessary object stores in the given database.
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
export async function clearData(subject) {
  const options_db = await openDB('Bookmarker', dbVersion, {
    upgrade(options_db) {
      initDefaults();
    },
  });

  if (subject === 'all') {
    options_db.clear('credentials');
    options_db.clear('options');
    options_db.clear('misc');
    options_db.clear('hashes');
    initDefaults();
  }

  if (subject === 'options') {
    options_db.clear('options');
    options_db.createObjectStore('options', { keyPath: 'item' });
  }

  if (subject === 'credentials') {
    options_db.clear('credentials');
    db.createObjectStore('credentials', { keyPath: 'item' });
  }

  if (subject === 'cache') {
    const cache_db = await openDB('BookmarkerCache', dbVersion, {
      upgrade(cache_db, dbVersion) {
        InitializeStores(cache_db, dbVersion);
      },
    });
    cache_db.clear('folders');
    cache_db.clear('keywords');
  }
}
// -----------------------------------------------------------------------
/**
 * Initializes default options and opens the 'Bookmarker' database.
 * @returns {Promise<void>}
 */
export async function initDatabase(db, oldVersion) {
  console.log('oldversion', oldVersion);

  //--- Clean installation
  if (oldVersion === 0) {
    console.log('freshstart');
    await InitializeStores(db);
    initDefaults();
  }
  //---  v0.16
  if (oldVersion === 1) {
    // copy data from old version
    const cbx_autoDesc = await load_data('options', 'cbx_autoDesc');
    const cbx_autoTags = await load_data('options', 'cbx_autoTags');
    const cbx_displayFolders = await load_data('options', 'cbx_displayFolders');
    // set default values for new version
    initDefaults();
    // restore data from previous version
    store_data('options', { cbx_autoTags: cbx_autoTags });
    store_data('options', { cbx_displayFolders: cbx_displayFolders });
    store_data('options', { cbx_autoDescription: cbx_autoDesc });
    // delete old data name
    delete_data('options', 'cbx_autoDesc');
  }
}

// -----------------------------------------------------------------------
export function initDefaults() {
  store_data('options', { cbx_showURL: true });
  store_data('options', { cbx_showDescription: true });
  store_data('options', { cbx_autoDescription: true });
  store_data('options', { cbx_showKeywords: true });
  store_data('options', { cbx_successMessage: true });
  store_data('options', { cbx_alreadyStored: true });
  store_data('options', { cbx_autoTags: true });
  store_data('options', { input_headlinesDepth: 3 });
  store_data('options', { input_networkTimeout: 10 });
  store_data('options', { cbx_reduceKeywords: true });
  store_data('options', { folderIDs: ['-1'] }); // Default to root folder
  store_data('options', { zenFolderIDs: ['-1'] }); // Default to root folder

  // Zen mode options
  store_data('options', { cbx_enableZen: false }); // Zen mode disabled by default
  store_data('options', { cbx_zenDisplayNotification: true }); // Show notifications in zen mode by default

  // Enhanced duplicate checking options
  store_data('options', { cbx_fuzzyUrlMatch: true }); // Normalize URLs to catch variants
  store_data('options', { cbx_cacheBookmarkChecks: true }); // Cache bookmark duplicate checks
  store_data('options', { input_bookmarkCacheTTL: 10 }); // Cache TTL in minutes
  store_data('options', { select_duplicateStrategy: 'update_existing' }); // Default duplicate handling
  store_data('options', { cbx_titleSimilarityCheck: false }); // Title similarity check (off by default)
  store_data('options', { input_titleSimilarityThreshold: 75 }); // Title similarity threshold (0-100)
  store_data('options', { input_titleCheckLimit: 20 }); // Limit bookmarks fetched for title check (performance)
}

// -----------------------------------------------------------------------

export async function createOldDatabase(version) {
  await deleteDB('Bookmarker');
  await deleteDB('Cache');

  if (version === 1) {
    let db = await openDB('Bookmarker', 1, {
      upgrade(db) {
        InitializeStores(db);
      },
    });
    db.put('credentials', {
      item: 'appPassword',
      value: 'ThisistheApppassword',
    });
    db.put('credentials', { item: 'loginname', value: 'admin' });
    db.put('credentials', { item: 'server', value: 'https://pascal:9025' });
    db.put('options', { item: 'cbx_autoDesc', value: true });
    db.put('options', { item: 'cbx_autoTags', value: true });
    db.put('options', { item: 'cbx_displayFolders', value: true });

    openDB('Cache', dbVersion, {
      upgrade(db) {
        db.createObjectStore('folders', { keyPath: 'item' });
        db.createObjectStore('tags', { keyPath: 'item' });
      },
    });
  }
}
