// ---------------------------------------------------------------------
async function TagsCacheGet() {
  const dbVersion = 1;

  return new Promise(async (resolve) => {
    const db = await idb.openDB('Cache', dbVersion, {
      upgrade(db) {
        db.createObjectStore('tags', { keyPath: 'item' });
      },
    });

    let tags = await db.get('tags', 'tags');
    let created = await db.get('tags', 'created');

    if (typeof tags === 'undefined' || tagsExpired(db, created)) resolve({});
    else resolve(tags);
  });
}
// ---------------------------------------------------------------------
async function TagsCacheAdd(BookmarkTags) {
  const dbVersion = 1;

  const db = await idb.openDB('Cache', dbVersion, {
    upgrade(db) {
      db.createObjectStore('tags', { keyPath: 'item' }); //TODO: Flur!
    },
  });

  db.put('tags', { item: 'tags', value: BookmarkTags.sort() });
  db.put('tags', { item: 'created', value: new Date().getTime() });
}
// ---------------------------------------------------------------------
function tagsExpired(db, created) {
  const one_day = 60 * 60 * 24 * 1000; // one day in milli seconds
  const diff = new Date().getTime() - created.value;
  if (diff > one_day) {
    // remove entry
    db.delete('tags', 'tags');
    db.delete('tags', 'created');
    return true;
  }
  return false;
}

export { TagsCacheAdd, TagsCacheGet };
