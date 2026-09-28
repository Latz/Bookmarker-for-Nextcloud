// @ts-check
import { load_data } from '../../../lib/storage.js';
import getData from './getData.js';
import apiCall from '../../../lib/apiCall.js';
import { notifyUser } from '../browser/notification.js';

export async function zenMode() {
  const data = await getData();

  // Restricted pages (chrome://, no host access, ...) yield no keywords/title.
  if (data.ok === false) {
    notifyUser({ status: 'error', statusText: data.error });
    return;
  }

  const selectedZenFolderIDs = await load_data('options', 'zenFolderIDs');
  const zenKeywords = await load_data('options', 'input_zenKeywords');

  const params = new URLSearchParams({
    title: data.title ?? '',
    url: data.url,
    description: data.description ?? '',
    page: '-1',
  });

  zenKeywords?.forEach((kw) => params.append('tags[]', kw));
  data.keywords?.forEach((kw) => params.append('tags[]', kw));
  selectedZenFolderIDs?.forEach((id) => params.append('folders[]', id));

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';

  let response;
  chrome.action.setBadgeText({ text: '💾' });
  try {
    response = await apiCall(endpoint, 'POST', params.toString());
  } finally {
    chrome.action.setBadgeText({ text: '' });
  }
  const zenNotify = await load_data('options', 'cbx_zenDisplayNotification');
  if (response.status === 'error' || zenNotify !== false) {
    notifyUser(response);
  }
}
