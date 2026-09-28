// Stand-in for src/lib/storage.js: fixed option values instead of IndexedDB.
export const OPTIONS = {
  cbx_autoTags: true,
  // Report every keyword found, not only those already stored in Nextcloud.
  cbx_reduceKeywords: false,
  // Extended keywords match against stored keywords, which we don't have.
  cbx_extendedKeywords: false,
  input_headings_slider: 3,
};

export async function getOption(name) {
  return OPTIONS[name] ?? false;
}

export async function getOptions(names) {
  return Object.fromEntries(names.map((name) => [name, OPTIONS[name] ?? false]));
}
