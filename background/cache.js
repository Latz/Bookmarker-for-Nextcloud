// ---------------------------------------------------------------------
async function CacheGet(type) {
  const dbVersion = 1;

  return new Promise(async (resolve) => {
    const db = await idb.openDB('Cache', dbVersion, {
      upgrade(db) {
        // there's no way to add a store to an existing database
        // without upgrading it, so the creation needs to done
        // with explicit names.
        db.createObjectStore('tags', { keyPath: 'item' });
        db.createObjectStore('folders', { keyPath: 'item' });
      },
    });

    let element = await db.get(type, type);
    let created = await db.get(type, `${type}_created`);

    if (typeof element === 'undefined' || elementExpired(db, type, created)) resolve({});
    else resolve(element);
  });
}
// ---------------------------------------------------------------------
async function CacheAdd(type, data) {
  const dbVersion = 1;

  const db = await idb.openDB('Cache', dbVersion, {
    upgrade(db) {
      db.createObjectStore(type, { keyPath: 'item' }); //TODO: Flur!
    },
  });

  db.put(type, { item: type, value: data });
  db.put(type, { item: `${type}_created`, value: new Date().getTime() });
}
// ---------------------------------------------------------------------
async function CacheTempAdd(type, data) {
  const dbVersion = 1;

  const db = await idb.openDB('Cache', dbVersion, {
    upgrade(db) {
      db.createObjectStore(type, { keyPath: 'item' }); //TODO: Flur!
    },
  });

  db.put(type, { item: type, value: data.sort() });
}
// ---------------------------------------------------------------------
function elementExpired(db, type, created) {
  const one_day = 60 * 60 * 24 * 1000; // one day in milli seconds
  const diff = new Date().getTime() - created.value;
  if (diff > one_day) {
    // remove entry
    db.delete(type, type);
    db.delete(type, `${type}_created`);
    return true;
  }
  return false;
}

export { CacheAdd, CacheGet, CacheTempAdd };
