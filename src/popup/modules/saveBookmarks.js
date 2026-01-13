import { cacheGet, cacheTempAdd } from '../../lib/cache.js';
import { getOption } from '../../lib/storage.js';

export default function addSaveBookmarkButtonListener() {
  document
    .getElementById('saveBookmark')
    .addEventListener('click', saveBookmark);
}

function saveBookmark(event) {
  event.preventDefault();

  const url = document.getElementById('url').value;
  const title = document.getElementById('title').value;
  const bookmarkID = parseInt(document.getElementById('bookmarkID').value);

  // Get options and form data asynchronously but don't await them
  Promise.all([
    getOption('cbx_showDescription'),
    getOption('cbx_showKeywords'),
    getOption('cbx_displayFolders'),
  ]).then(async ([showDescription, showKeywords, displayFolders]) => {
    let description = document.getElementById('description').value;
    description = showDescription && description.length > 0
      ? `&description=${description}`
      : '';

    let tags = '';
    let keywords = [];
    try {
      tags = '&tags[]=';
      if (showKeywords) {
        keywords = JSON.parse(document.getElementById('keywords').value);
        keywords.forEach((keyword) => (tags += `&tags[]=${keyword.value}`));
      }
    } catch {
      tags = '&tags[]=';
    }

    let selectedFolders = '';
    let folderIDs = [];
    if (displayFolders) {
      for (let folder of document.getElementById('folders').options) {
        if (folder.selected) {
          selectedFolders += `&folders[]=${folder.value}`;
          folderIDs.push(folder.value);
        }
      }
    } else {
      // default to root folder
      selectedFolders += `&folders[]=-1`;
    }

    const parameters = `title=${encodeURIComponent(
      title
    )}&url=${encodeURIComponent(
      url
    )}${description}${tags}${selectedFolders}&page=-1`;

    // Send message to background
    chrome.runtime.sendMessage({
      msg: 'saveBookmark',
      parameters,
      folderIDs,
      bookmarkID,
    });

    // Update cache for new tags
    try {
      let cachedTags = await cacheGet('keywords');
      cachedTags = cachedTags.map((tag) => tag.toLowerCase());
      let tempTags = [];
      keywords.forEach((keyword) => {
        if (!cachedTags.includes(keyword.value.toLowerCase())) {
          tempTags.push(keyword.value);
        }
      });
      if (tempTags.length > 0) cacheTempAdd('keywords', tempTags);
    } catch (error) {
      console.error('Error updating cache:', error);
    }
  });

  // Close popup immediately
  window.close();
}
