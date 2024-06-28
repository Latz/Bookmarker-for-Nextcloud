import { getOption } from '../../lib/storage.js';
import getBrowserTheme from './getBrowserTheme.js';

async function getIconUrl() {
  const browserTheme = await getBrowserTheme();
  return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}.png`);
}
async function getIconErrorUrl() {
  const browserTheme = await getBrowserTheme();
  return chrome.runtime.getURL(
    `/images/icon-128x128-${browserTheme}-error.png`,
  );
}

export async function notifyUser(response) {
  // load the browser theme to display a visible icon
  const iconUrl = await getIconUrl();
  const iconErrorUrl = await getIconErrorUrl();

  // user does not want to be notified
  if (!(await getOption('cbx_successMessage'))) return;
  const title = 'Bookmarker for Nextcloud';

  // Bookmark was saved successfully
  if (response.status === 'success') {
    const zenMode = await getOption('cbx_enableZen');
    const zenDisplayNotification = await getOption(
      'cbx_zenDisplayNotification',
    );
    console.log(
      'zenMode',
      zenMode,
      'zenDisplayNotification',
      zenDisplayNotification,
    );
    if (zenMode && zenDisplayNotification) {
      chrome.notifications.create('', {
        title,
        message: `${chrome.i18n.getMessage('BookmarkSuccessfullySaved')}!`,
        iconUrl,
        type: 'basic',
      });
    }
  } else {
    // There was an error
    chrome.notifications.create('', {
      title,
      message: `${chrome.i18n.getMessage('error')}: ${response.statusText}`,
      iconUrl: iconErrorUrl,
      type: 'basic',
      requireInteraction: true,
      buttons: [
        {
          title: `${chrome.i18n.getMessage('dismiss')}.`,
        },
      ],
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
