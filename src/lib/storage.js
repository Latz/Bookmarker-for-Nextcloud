const database = 'Bookmarker';
const dbVersion = 2; // since v0.3

import { openDB, deleteDB } from 'idb';

// -----------------------------------------------------------------------

/**
 * Loads data from the specified store for the given items.
 *
 * @param {string} storeName - The name of the store to load data from.
 * @param {...any} items - The items to load data for.
 * @return {Promise<any>|any} - A promise that resolves to an object containing the loaded data for each item, or a single value if only one item is provided.
 */
export async function load_data(storeName, ...items) {
  console.log('load_data', storeName, items);
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
 * @param {string} optionName - The name of the option.
 * @returns {any} - The value of the option.
 */
export async function getOption(optionName) {
  let data = await load_data('options', optionName);
  if (data === undefined) data = false;
  return data;
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
  return;

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
