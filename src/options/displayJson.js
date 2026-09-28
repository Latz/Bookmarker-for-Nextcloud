// @ts-check
import { openDB } from 'idb';
import { load_data_all } from '../lib/storage.js';
import { cacheDbVersion, initCacheStores } from '../lib/cacheSchema.js';

// Developer view: ?type=options or ?type=cache, opened from the options page.
const type = new URLSearchParams(window.location.search).get('type');
let data;
try {
  if (type === 'options') data = await load_data_all('options');
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
      db.close();
    }
  }
} catch (error) {
  // Show the failure instead of leaving the page blank
  data = { error: error instanceof Error ? error.message : String(error) };
}
const pre = document.createElement('pre');
pre.textContent = JSON.stringify(data, null, 4);
document.getElementById('jsondata').replaceChildren(pre);
