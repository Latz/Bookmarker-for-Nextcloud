const database = 'Bookmarker';
const dbVersion = 1;

// -----------------------------------------------------------------------

export async function load_data(storeName, ...items) {
  const db = await idb.openDB(database, dbVersion, {
    upgrade(db) {
      createStores(db);
    },
  });

  console.log('items :>> ', items);

  let result = {};

  for (let item of items) {
    let data = await db.get(storeName, item).catch((error) => {
      return result;
    });
    result[item] = data !== undefined ? data.value : undefined;
  }

  console.log('load_data', result);

  // if there's only 1 item in the object return the value instead of the object
  if (Object.keys(result).length === 1) return result[Object.keys(result)[0]];

  return result;
}

// -----------------------------------------------------------------------

export async function store_data(storeName, ...items) {
  const db = await idb.openDB(database, dbVersion, {
    upgrade(db) {
      createStores(db);
    },
  });
  for (let item of items) {
    for (let key in item) db.put(storeName, { item: key, value: item[key] });
  }
}
// -----------------------------------------------------------------------

export async function delete_data(storeName, ...items) {
  const db = await idb.openDB(database, dbVersion, {
    upgrade(db) {
      createStores(db);
    },
  });

  for (let item of items) {
    db.delete(storeName, item).catch((error) => {
      return;
    });
  }
}

// ---------------------------------------------------------------------
function createStores(db) {
  db.createObjectStore('credentials', { keyPath: 'item' });
  db.createObjectStore('options', { keyPath: 'item' });
  db.createObjectStore('misc', { keyPath: 'item' });
}
