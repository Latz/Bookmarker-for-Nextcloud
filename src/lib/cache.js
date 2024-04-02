import { openDB } from 'idb';
import apiCall from './apiCall.js';
import { preRenderFolders } from '../background/modules/getFolders.js';
import { cacheRefreshNotification } from '../background/modules/notification.js';

const dbName = 'BookmarkerCache';
const dbVersion = 2;

// ---------------------------------------------------------------------
export async function cacheGet(type, forceServer = false) {
  const db = await openDB(dbName, dbVersion, {
    upgrade(db) {
      // there's no way to add a store to an existing database
      // without upgrading it, so the creation needs to done
      // with explicit names.
      db.createObjectStore('keywords', { keyPath: 'item' });
      db.createObjectStore('folders', { keyPath: 'item' });
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
      'GET'
    );
    if (type === 'folders') {
      data = preRenderFolders(data.data);
    }
    cacheAdd(type, data);
    if (forceServer) cacheRefreshNotification();
    return data;
  } else {
    // data was found in cache -> return cache elements
    console.log('load from cache');
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
