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
    const description = showDescription && rawDescription.length > 0
      ? `&description=${rawDescription}`
      : '';

    let keywords = /** @type {Array<{value: string}>} */ ([]);
    let tags = '&tags[]=';
    try {
      if (showKeywords) {
        keywords = JSON.parse(/** @type {HTMLInputElement} */ (document.getElementById('keywords')).value);
        tags += keywords.map((kw) => `&tags[]=${kw.value}`).join('');
      }
    } catch {
      tags = '&tags[]=';
    }

    let folderIDs = /** @type {string[]} */ ([]);
    let selectedFolders;
    if (displayFolders) {
      folderIDs = Array.from(/** @type {HTMLSelectElement} */ (document.getElementById('folders')).options)
        .filter((opt) => opt.selected)
        .map((opt) => opt.value);
      selectedFolders = folderIDs.map((id) => `&folders[]=${id}`).join('');
    } else {
      selectedFolders = '&folders[]=-1';
    }

    const parameters = `title=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}${description}${tags}${selectedFolders}&page=-1`;

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
