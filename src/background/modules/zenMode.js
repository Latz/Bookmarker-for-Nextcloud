import { load_data } from '../../lib/storage';
import getData from './getData';
import apiCall from '../../lib/apiCall';
import { notifyUser } from './notification';

export async function zenMode() {
  console.log('zenMode');
  const data = await getData();
  console.log('data:', data);

  const selectedZenFolders = await load_data('options', 'zenFolders');
  const zenKeywords = await load_data('options', 'input_zenKeywords');
  console.log('zenKeywords', zenKeywords);

  const parameters = `title=${encodeURIComponent(data.title)}&url=${data.url}&description=${data.description}&tags[]=${zenKeywords}&folders[]=${selectedZenFolders}&page=-1`;

  console.log('parameters', parameters);

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = 'POST';

  chrome.action.setBadgeText({ text: '💾' });
  const response = await apiCall(endpoint, method, parameters);
  chrome.action.setBadgeText({ text: '' });
  notifyUser(response);
  console.log('🚀 ~ zenMode ~ response:', response);
}

export function enableZenMode(menuItemId) {
  console.log('enableZenMode', menuItemId.checked);
  chrome.contextMenus.update(menuItemId, { type: 'checkbox', checked: true });
}
