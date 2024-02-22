import { cacheGet, cacheTempAdd } from '../../lib/cache.js';
import { getOption } from '../../lib/storage.js';

export default function addSaveBookmarkButtonListener() {
  document
    .getElementById('saveBookmark')
    .addEventListener('click', saveBookmark);
}

async function saveBookmark(event) {
  event.preventDefault();

  const url = document.getElementById('url').value;
  const title = document.getElementById('title').value;
  let description = document.getElementById('description').value;
  const bookmarkID = parseInt(document.getElementById('bookmarkID').value);
  description =
    (await getOption('cbx_showDescription')) && description.length > 0
      ? `&description=${description}`
      : '';
  let tags = '';
  let keywords = [];
  try {
    tags = '&tags[]=';
    if (await getOption('cbx_showKeywords')) {
      keywords = JSON.parse(document.getElementById('keywords').value);
      keywords.forEach((keyword) => (tags += `&tags[]=${keyword.value}`));
    }
  } catch {
    tags = '&tags[]=';
  }

  let selectedFolders = '';
  let folderIDs = [];
  if (await getOption('cbx_displayFolders')) {
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
  chrome.runtime.sendMessage({
    msg: 'saveBookmark',
    parameters,
    folderIDs,
    bookmarkID,
  });

  // If the user adds a new Tag it needs to be added to the cache so it's instantly available
  let cachedTags = await cacheGet('keywords');
  cachedTags = cachedTags.map((tag) => tag.toLowerCase());
  let tempTags = [];
  keywords.forEach((keyword) => {
    if (!cachedTags.includes(keyword.value.toLowerCase())) {
      tempTags.push(keyword.value);
    }
  });
  if (tempTags.length > 0) cacheTempAdd('keywords', tempTags);

  window.close();
}
