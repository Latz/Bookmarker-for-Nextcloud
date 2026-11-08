// @ts-check
// Persistent storage of the extension, in chrome.storage.local, grouped into
// "stores" by key prefix (`<store>.<item>`):
//   credentials - server, loginname, appPassword
//   options     - all user settings (see DEFAULT_OPTIONS below)
//   misc, hashes - small internal values
// (The separate cache database is handled in cache.js and stays IndexedDB.)
//
// This used to live in the IndexedDB database "Bookmarker". IndexedDB is site
// data of the chrome-extension:// origin, and browsers set to clear site data
// on exit (seen in Vivaldi) wiped the login on every restart.
// chrome.storage.local is extension settings and is not touched by that.
// migrateFromIndexedDB() moves the old data over once.
//
// Options are cached in memory for a short time, because the popup reads many
// of them on every open.
const legacyDatabase = 'Bookmarker';
const legacyDbVersion = 2;
const STORES = ['credentials', 'options', 'misc', 'hashes'];
const MIGRATED_KEY = 'storage.migrated';

import { openDB, deleteDB } from 'idb';
import { clearAiCache } from './aiCache.js';
import { aiProviderDefaults } from './aiProviders.js';
import { cacheDbVersion, initCacheStores } from './cacheSchema.js';

// -----------------------------------------------------------------------
// Options caching for performance
// -----------------------------------------------------------------------

// Cache stores { value, timestamp } objects for per-option expiration
const optionsCache = new Map();
const CACHE_TTL = 30000; // 30 seconds TTL for options cache

// In-flight reads (name -> Promise<value>). A read that has been dispatched but
// not yet resolved is not in optionsCache, so without this a second caller
// (e.g. the popup's prefetch followed by createForm) repeats the storage get.
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
// chrome.storage.local access and the one-time IndexedDB migration
// -----------------------------------------------------------------------

const keyOf = (storeName, item) => `${storeName}.${item}`;

let ready = null;

/** Forget that the migration ran in this context — for test isolation only. */
export function _resetForTesting() {
  ready = null;
}

/**
 * chrome.storage.local, once the old IndexedDB data has been moved there.
 * @returns {Promise<chrome.storage.LocalStorageArea>}
 */
async function getArea() {
  ready ??= migrateFromIndexedDB();
  await ready;
  return chrome.storage.local;
}

/**
 * Copies every record of the old "Bookmarker" IndexedDB into
 * chrome.storage.local (keys already there win), then deletes the database so
 * no second copy of the app password is left behind. Runs once; if IndexedDB
 * cannot be read it is retried on the next start, and the extension carries on
 * with what chrome.storage.local has.
 * @returns {Promise<void>}
 */
async function migrateFromIndexedDB() {
  const area = chrome.storage.local;
  const existing = await area.get(null);
  if (existing[MIGRATED_KEY]) return;

  try {
    const db = await openDB(legacyDatabase, legacyDbVersion, {
      // Fresh install (or a pre-v2 database): create what is missing so the
      // reads below work; the database is deleted right after anyway.
      upgrade(upgradeDb) {
        for (const store of STORES) {
          if (!upgradeDb.objectStoreNames.contains(store)) {
            upgradeDb.createObjectStore(store, { keyPath: 'item' });
          }
        }
      },
    });
    const copy = {};
    try {
      for (const store of STORES) {
        const records = await db.getAll(store).catch(() => []);
        for (const { item, value } of records) {
          // cbx_autoDesc is the v1 name of cbx_autoDescription
          const name =
            store === 'options' && item === 'cbx_autoDesc'
              ? 'cbx_autoDescription'
              : item;
          const key = keyOf(store, name);
          if (!(key in existing) && !(key in copy)) copy[key] = value;
        }
      }
    } finally {
      db.close();
    }
    await area.set({ ...copy, [MIGRATED_KEY]: true });
  } catch (error) {
    console.error('[storage] could not migrate the old database:', error);
    return;
  }
  await deleteDB(legacyDatabase).catch(() => {});
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
  const area = await getArea();
  const stored = await area.get(items.map((item) => keyOf(storeName, item)));

  const result = {};
  for (const item of items) result[item] = stored[keyOf(storeName, item)];

  // if there's only 1 item in the object return the value instead of the object
  if (items.length === 1) return result[items[0]];

  // Deliberately not logged: this path serves load_data('credentials',
  // 'loginname', 'appPassword'), so any logging here prints the app password.
  return result;
}

// -----------------------------------------------------------------------------------------------------
/**
 * Loads all records of the specified store.
 * @param {string} storeName - The name of the store to load data from.
 * @returns {Promise<Array<{item: string, value: any}>>}
 */
export async function load_data_all(storeName) {
  const area = await getArea();
  const prefix = `${storeName}.`;
  return Object.entries(await area.get(null))
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => ({ item: key.slice(prefix.length), value }));
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
  const area = await getArea();
  // Each argument is an object; every key/value pair becomes one entry, e.g.
  // store_data('options', { a: 1, b: 2 }) writes options.a and options.b.
  const values = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      values[keyOf(storeName, key)] = value;
    }
  }
  await area.set(values);

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
 * Deletes specified items from the given store.
 *
 * @param {string} storeName - The name of the store from which to delete the items.
 * @param {...any} items - The items to be deleted.
 * @return {Promise<void>} - A promise that resolves when the deletion is complete.
 */
export async function delete_data(storeName, ...items) {
  const area = await getArea();
  await area.remove(items.map((item) => keyOf(storeName, item)));
}

// -----------------------------------------------------------------------
/**
 * Retrieves the value of the specified option.
 * Cached for performance (30s TTL per option)
 * @param {string} optionName - The name of the option.
 * @returns {Promise<any>} - The value of the option.
 */
export async function getOption(optionName) {
  return (await getOptions([optionName]))[optionName];
}

/**
 * Get multiple options at once (one storage read for all uncached ones).
 * An option that was never stored reads as `false`, so callers can use plain
 * truthiness checks (`if (await getOption('cbx_...'))`).
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
      if (now - cached.timestamp < CACHE_TTL) {
        result[name] = cached.value;
        continue;
      }
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

  if (namesToFetch.length > 0) {
    const batch = (async () => {
      const area = await getArea();
      return area.get(namesToFetch.map((name) => keyOf('options', name)));
    })();

    // Publish each name as pending so concurrent callers can join, and update
    // the cache with per-option timestamps as the batch resolves
    for (const name of namesToFetch) {
      const pending = batch
        .then((stored) => {
          const value = stored[keyOf('options', name)] ?? false;
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
    }
  }

  await Promise.all(joined);

  return result;
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
    await clearAiCache();
    return;
  }

  const stores = {
    all: STORES,
    options: ['options'],
    credentials: ['credentials'],
  }[subject];
  if (!stores) return;

  const area = await getArea();
  const prefixes = stores.map((store) => `${store}.`);
  const keys = Object.keys(await area.get(null)).filter((key) =>
    prefixes.some((prefix) => key.startsWith(prefix)),
  );
  await area.remove(keys);

  clearOptionsCache();
  // An emptied options store would make every option read back as false.
  if (stores.includes('options')) await initDefaults();
  if (stores.includes('credentials')) await notifyCredentialsChanged();
}

// -----------------------------------------------------------------------
/**
 * Writes every default option, overwriting the stored values (used by
 * "Reset options").
 * @returns {Promise<void>}
 */
export function initDefaults() {
  return store_data('options', DEFAULT_OPTIONS);
}

/**
 * Adds every default option that is missing, leaving existing values alone.
 * Runs on service worker start, so a fresh install and users who updated from
 * an older release both get every option (otherwise new features would stay
 * silently off).
 * @returns {Promise<void>}
 */
export async function ensureDefaults() {
  const existing = new Set(
    (await load_data_all('options')).map(({ item }) => item),
  );
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
