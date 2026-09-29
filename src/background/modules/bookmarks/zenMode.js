// @ts-check
import { load_data } from '../../../lib/storage.js';
import getData from './getData.js';
import apiCall from '../../../lib/apiCall.js';
import { notifyUser } from '../browser/notification.js';

/**
 * "Zen mode": saves the active tab as a bookmark in one step, without opening
 * the popup.
 *
 * Flow: collect the page data (title, description, keywords) exactly like the
 * popup would, add the user's pre-configured zen keywords and folders from the
 * options, POST the bookmark to Nextcloud, then optionally notify the user.
 *
 * @returns {Promise<void>}
 */
export async function zenMode() {
  const data = await getData();

  // Restricted pages (chrome://, no host access, ...) yield no keywords/title.
  if (data.ok === false) {
    notifyUser({ status: 'error', statusText: data.error });
    return;
  }

  // Folder IDs and extra keywords the user configured for zen mode.
  const selectedZenFolderIDs = await load_data('options', 'zenFolderIDs');
  const zenKeywords = await load_data('options', 'input_zenKeywords');

  // The Bookmarks API expects a form-encoded body. `page: -1` is the API's
  // convention for "no page" (the bookmark is not tied to a paginated view).
  const params = new URLSearchParams({
    title: data.title ?? '',
    url: data.url,
    description: data.description ?? '',
    page: '-1',
  });

  // Array values use the `name[]` notation, one entry per value. Zen keywords
  // come first, then the keywords extracted from the page.
  zenKeywords?.forEach((kw) => params.append('tags[]', kw));
  data.keywords?.forEach((kw) => params.append('tags[]', kw));
  selectedZenFolderIDs?.forEach((id) => params.append('folders[]', id));

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';

  let response;
  // Show a disk badge on the toolbar icon while the request is in flight, as
  // feedback because there is no popup. The finally guarantees it is removed
  // even if the request throws.
  chrome.action.setBadgeText({ text: '💾' });
  try {
    response = await apiCall(endpoint, 'POST', params.toString());
  } finally {
    chrome.action.setBadgeText({ text: '' });
  }
  // Errors are always shown; success only if the user has not turned the
  // notification off (the option is on unless explicitly set to false).
  const zenNotify = await load_data('options', 'cbx_zenDisplayNotification');
  if (response.status === 'error' || zenNotify !== false) {
    notifyUser(response);
  }
}
