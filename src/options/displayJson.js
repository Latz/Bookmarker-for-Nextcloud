// @ts-check
// Developer view that dumps stored data as pretty-printed JSON. It is opened
// from the options page in a new tab and only reads, it never modifies data.
import { openDB } from 'idb';
import { load_data_all } from '../lib/storage.js';
import { cacheDbVersion, initCacheStores } from '../lib/cacheSchema.js';

// Developer view: ?type=options or ?type=cache, opened from the options page.
// Any other value (or none) leaves `data` undefined and renders an empty page.
const type = new URLSearchParams(window.location.search).get('type');
let data;
try {
  // All stored extension options.
  if (type === 'options') data = await load_data_all('options');
  // The cached keyword list from the BookmarkerCache IndexedDB.
  if (type === 'cache') {
    // The version and upgrade come from cacheSchema: a hard-coded old version
    // fails with a VersionError, and opening without the upgrade callback would
    // create an empty database that cache.js then never populates.
    const db = await openDB('BookmarkerCache', cacheDbVersion, {
      upgrade: initCacheStores,
    });
    try {
      data = await db.get('keywords', 'keywords');
    } finally {
      // Always release the connection, otherwise a later version upgrade
      // (e.g. clearing the cache) would be blocked by this open handle.
      db.close();
    }
  }
} catch (error) {
  // Show the failure instead of leaving the page blank
  data = { error: error instanceof Error ? error.message : String(error) };
}
// textContent (not innerHTML): the data comes from storage and may contain
// arbitrary page-derived strings, which must not be interpreted as markup.
const pre = document.createElement('pre');
pre.textContent = JSON.stringify(data, null, 4);
document.getElementById('jsondata').replaceChildren(pre);
