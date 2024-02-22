import { getOption } from '../../lib/storage.js';
import getBrowserTheme from './getBrowserTheme.js';



async function getIconUrl() {
  const browserTheme = await getBrowserTheme();
  return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}.png`);
}

export async function notifyUser(response) {

  // load the browser theme to display a visible icon
  const iconUrl = await getIconUrl();

  // user does not want to be notified
  if (!(await getOption('cbx_successMessage'))) return;
  const title = 'Bookmarker for Nextcloud';

  // Bookmark was saved successfully
  if (response.status === 'success') {
    chrome.notifications.create('', {
      title,
      message: `Your bookmark was saved successfully!`,
      iconUrl,
      type: 'basic',
    });
  } else {
    // There was an error
    chrome.notifications.create('', {
      title,
      message: `Error: ${response.statusText}`,
      iconUrl: iconUrl,
      type: 'basic',
    });
  }
}

export async function cacheRefreshNotification() {
  const iconUrl = await getIconUrl();
  chrome.notifications.create('', {
    title: 'Bookmarker for Nextcloud',
    message: 'Cache was refreshed',
    iconUrl,
    type: 'basic',
  });
}
