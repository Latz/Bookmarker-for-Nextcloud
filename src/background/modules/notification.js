import { getOption } from '../../lib/storage.js';
import getBrowserTheme from './getBrowserTheme.js';

// OPTIMIZATION: Constant for notification title (avoid repetition)
const NOTIFICATION_TITLE = 'Bookmarker for Nextcloud';

// OPTIMIZATION: Get icon URL with browser theme (reusable helper)
async function getIconUrl() {
  const browserTheme = await getBrowserTheme();
  return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}.png`);
}

// OPTIMIZATION: Get error icon URL with fallback to regular icon
async function getIconErrorUrl() {
  const browserTheme = await getBrowserTheme();
  const errorIconUrl = `/images/icon-128x128-${browserTheme}-error.png`;

  // Try to get the error icon, fall back to regular icon if it doesn't exist
  try {
    // Check if the error icon exists by trying to fetch it
    const response = await fetch(chrome.runtime.getURL(errorIconUrl));
    if (response.ok) {
      return chrome.runtime.getURL(errorIconUrl);
    }
  } catch (e) {
    // Error icon doesn't exist, use regular icon
  }

  // Fall back to regular icon
  return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}.png`);
}

export async function notifyUser(response) {
  if (response.status === 'error') {
    // There was an error - always show error notifications (regardless of successMessage setting)
    const iconErrorUrl = await getIconErrorUrl();

    try {
      await chrome.notifications.create('', {
        title: NOTIFICATION_TITLE,
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
    } catch (error) {
      console.error('Failed to create error notification:', error);
    }
  } else {
    // Bookmark was saved successfully
    // Check if user wants success notifications
    const successNotifications = await getOption('cbx_successMessage');
    if (!successNotifications) return;

    // OPTIMIZATION: Only fetch icon if we're actually showing the notification
    const iconUrl = await getIconUrl();

    try {
      await chrome.notifications.create('', {
        title: NOTIFICATION_TITLE,
        message: `${chrome.i18n.getMessage('BookmarkSuccessfullySaved')}!`,
        iconUrl,
        type: 'basic',
      });
    } catch (error) {
      console.error('Failed to create success notification:', error);
    }
  }
}

export async function cacheRefreshNotification() {
  const iconUrl = await getIconUrl();
  try {
    await chrome.notifications.create('', {
      title: NOTIFICATION_TITLE,
      message: 'Cache was refreshed',
      iconUrl,
      type: 'basic',
    });
  } catch (error) {
    console.error('Failed to create cache refresh notification:', error);
  }
}
