// @ts-check
import apiCall from '../../../lib/apiCall.js';
import { store_data } from '../../../lib/storage.js';
import { cacheGet, cacheTempAdd } from '../../../lib/cache.js';
import { notifyUser } from '../browser/notification.js';

/**
 * Saves a bookmark by making an API call to create a new bookmark or update an existing one.
 * It also stores the last selected folders, displays a notification to the user based on the response from the API call,
 * and, on success, adds any newly-used tags to the keyword-suggestion cache.
 * @param {object} data - The data of the bookmark to be saved.
 * @param {array} folderIDs - The IDs of the folders where the bookmark should be saved.
 * @param {number} bookmarkID - The ID of the bookmark to be updated, if it exists.
 * @returns {Promise<void>}
 */
export async function saveBookmark(data, folderIDs, bookmarkID) {
  const endpoint =
    bookmarkID > 0
      ? `index.php/apps/bookmarks/public/rest/v2/bookmark/${bookmarkID}`
      : 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = bookmarkID > 0 ? 'PUT' : 'POST';

  chrome.action.setBadgeText({ text: '💾' });
  const response = await apiCall(endpoint, method, data);

  await store_data('options', { folderIDs });
    chrome.action.setBadgeText({ text: '' });
  notifyUser(response);

  if (response.status === 'success') {
    updateKeywordCache(data).catch((error) => {
      console.error('Error updating cache:', error);
    });
  }
}

/**
 * Adds any newly-used tags from a save to the keyword-suggestion cache.
 * Runs in the service worker (not the popup) so it isn't cut off by
 * `window.close()` -- the popup's own attempt at this raced its teardown.
 * @param {object} data - The saved bookmark's form data (URLSearchParams-compatible).
 * @returns {Promise<void>}
 */
async function updateKeywordCache(data) {
  const keywords = new URLSearchParams(data)
    .getAll('tags[]')
    .filter((tag) => tag.length > 0);
  if (keywords.length === 0) return;

  const cachedTags = new Set(
    (await cacheGet('keywords')).map((tag) => tag.toLowerCase()),
  );
  const newTags = keywords.filter((tag) => !cachedTags.has(tag.toLowerCase()));
  if (newTags.length > 0) await cacheTempAdd('keywords', newTags);
}
