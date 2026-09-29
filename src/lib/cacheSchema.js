// @ts-check
// Shared BookmarkerCache DB schema, used by cache.js and storage.js's
// clearData('cache') so both always agree on the version and stores.
//
// IndexedDB only runs the `upgrade` callback when the requested version is
// higher than the stored one. Whenever a store is added or changed, bump the
// version below so existing installs get the new schema.
export const cacheDbVersion = 3; // Incremented for bookmarkChecks store

/**
 * Creates the BookmarkerCache object stores. Meant to be passed as the
 * `upgrade` callback of `openDB` (it runs inside the versionchange transaction).
 *
 * All stores use the same layout: records are keyed by their `item` property.
 *  - keywords:        cached keyword lists
 *  - folders:         cached folder tree from the server
 *  - bookmarkChecks:  results of "does this URL already exist as a bookmark?"
 *
 * @param {import('idb').IDBPDatabase<any>} db - The database being upgraded.
 */
export function initCacheStores(db) {
  try {
    db.createObjectStore('keywords', { keyPath: 'item' });
    db.createObjectStore('folders', { keyPath: 'item' });
    db.createObjectStore('bookmarkChecks', { keyPath: 'item' });
  } catch (e) {
    // createObjectStore throws if a store already exists (e.g. on a re-run of
    // the upgrade); that is harmless, so just log it.
    console.log(e);
  }
}
