// @ts-check
// Shared BookmarkerCache DB schema, used by cache.js and storage.js's
// clearData('cache') so both always agree on the version and stores.
export const cacheDbVersion = 3; // Incremented for bookmarkChecks store

/** Creates the BookmarkerCache object stores. */
export function initCacheStores(db) {
  try {
    db.createObjectStore('keywords', { keyPath: 'item' });
    db.createObjectStore('folders', { keyPath: 'item' });
    db.createObjectStore('bookmarkChecks', { keyPath: 'item' });
  } catch (e) {
    console.log(e);
  }
}
