// Stand-in for src/lib/cache.js: no stored bookmarks/keywords.
export async function cacheGet() {
  return [];
}

// Imported by getData.js / getFolders.js; never called here.
export async function cacheAdd() {}
export async function cacheTempAdd() {}
export async function getCachedBookmarkCheck() {
  return null;
}
export async function cacheBookmarkCheck() {}
