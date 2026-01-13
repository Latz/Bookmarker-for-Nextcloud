import { load_data } from '../../lib/storage.js';
import getData from './getData.js';
import apiCall from '../../lib/apiCall.js';
import { notifyUser } from './notification.js';

export async function zenMode() {
  const data = await getData();

  let folders = '';
  const selectedZenFolderIDs = await load_data('options', 'zenFolderIDs');
  if (selectedZenFolderIDs !== undefined) {
    selectedZenFolderIDs.forEach(
      (folder) => (folders += `&folders[]=${folder}`),
    );
  }

  let tags = '';
  const zenKeywords = await load_data('options', 'input_zenKeywords');
  if (zenKeywords !== undefined) {
    zenKeywords.forEach((keyword) => (tags += `&tags[]=${keyword}`));
  }
  if (data.keywords.length > 0)
    data.keywords.forEach((keyword) => (tags += `&tags[]=${keyword}`));

  const parameters = `title=${encodeURIComponent(data.title)}&url=${data.url}&description=${data.description}${tags}${folders}&page=-1`;

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = 'POST';

  chrome.action.setBadgeText({ text: '💾' });
  const response = await apiCall(endpoint, method, parameters);
  chrome.action.setBadgeText({ text: '' });
  notifyUser(response);
}

export function enableZenMode(menuItemId) {
  console.log('enableZenMode', menuItemId.checked);
  chrome.contextMenus.update(menuItemId, { type: 'checkbox', checked: true });
}
