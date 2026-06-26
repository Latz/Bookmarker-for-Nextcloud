// @ts-check
import { load_data } from '../../lib/storage.js';
import getData from './getData.js';
import apiCall from '../../lib/apiCall.js';
import { notifyUser } from './notification.js';

export async function zenMode() {
  const data = await getData();

  const selectedZenFolderIDs = await load_data('options', 'zenFolderIDs');
  const zenKeywords = await load_data('options', 'input_zenKeywords');

  const params = new URLSearchParams({
    title: data.title,
    url: data.url,
    description: data.description,
    page: '-1',
  });

  zenKeywords?.forEach((kw) => params.append('tags[]', kw));
  data.keywords.forEach((kw) => params.append('tags[]', kw));
  selectedZenFolderIDs?.forEach((id) => params.append('folders[]', id));

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';

  chrome.action.setBadgeText({ text: '💾' });
  const response = await apiCall(endpoint, 'POST', params.toString());
  chrome.action.setBadgeText({ text: '' });
  const zenNotify = await load_data('options', 'cbx_zenDisplayNotification');
  if (response.status === 'error' || zenNotify !== false) {
    notifyUser(response);
  }
}

