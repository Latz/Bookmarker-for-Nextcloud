// @ts-check
import { cacheGet, cacheTempAdd } from '../../lib/cache.js';
import { getOption } from '../../lib/storage.js';

export default function addSaveBookmarkButtonListener() {
  document
    .getElementById('saveBookmark')
    .addEventListener('click', saveBookmark);
}

function saveBookmark(event) {
  event.preventDefault();

  const url = /** @type {HTMLInputElement} */ (document.getElementById('url')).value;
  const title = /** @type {HTMLInputElement} */ (document.getElementById('title')).value;
  const bookmarkID = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('bookmarkID')).value);

  (async () => {
    const [showDescription, showKeywords, displayFolders] = await Promise.all([
      getOption('cbx_showDescription'),
      getOption('cbx_showKeywords'),
      getOption('cbx_displayFolders'),
    ]);

    const rawDescription = /** @type {HTMLTextAreaElement} */ (document.getElementById('description')).value;

    let keywords = /** @type {Array<{value: string}>} */ ([]);
    try {
      if (showKeywords) {
        keywords = JSON.parse(/** @type {HTMLInputElement} */ (document.getElementById('keywords')).value);
      }
    } catch {
      keywords = [];
    }

    let folderIDs = /** @type {string[]} */ ([]);
    if (displayFolders) {
      folderIDs = Array.from(/** @type {HTMLSelectElement} */ (document.getElementById('folders')).options)
        .filter((opt) => opt.selected)
        .map((opt) => opt.value);
    }

    // Built with URLSearchParams rather than string concatenation. Previously
    // description, tag values and folder IDs were interpolated raw, so a value
    // containing "&" or "=" injected extra parameters into the API call -- a
    // tag named `x&folders[]=42` filed the bookmark into folder 42 regardless
    // of what the user selected. Only title and url were ever encoded.
    // zenMode.js already builds its payload this way.
    const params = new URLSearchParams();
    params.set('title', title);
    params.set('url', url);
    if (showDescription && rawDescription.length > 0) {
      params.set('description', rawDescription);
    }
    // The leading empty tags[] entry is preserved from the original payload:
    // the parameter has to be present for the API to clear existing tags.
    params.append('tags[]', '');
    for (const keyword of keywords) {
      params.append('tags[]', keyword.value);
    }
    if (displayFolders) {
      for (const id of folderIDs) params.append('folders[]', id);
    } else {
      params.append('folders[]', '-1');
    }
    params.set('page', '-1');

    const parameters = params.toString();

    chrome.runtime.sendMessage({ msg: 'saveBookmark', parameters, folderIDs, bookmarkID });

    try {
      let cachedTags = await cacheGet('keywords');
      cachedTags = cachedTags.map((/** @type {string} */ tag) => tag.toLowerCase());
      const tempTags = keywords
        .filter((kw) => !cachedTags.includes(kw.value.toLowerCase()))
        .map((kw) => kw.value);
      if (tempTags.length > 0) cacheTempAdd('keywords', tempTags);
    } catch (error) {
      console.error('Error updating cache:', error);
    }
  })();

  // Close popup immediately
  window.close();
}
