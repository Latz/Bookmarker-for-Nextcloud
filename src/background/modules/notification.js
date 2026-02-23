import { getOption } from '../../lib/storage.js';
import getBrowserTheme from './getBrowserTheme.js';

// OPTIMIZATION: Constant for notification title (avoid repetition)
const NOTIFICATION_TITLE = 'Bookmarker for Nextcloud';

// Cache which themes have error icons (checked once at startup)
let errorIconsAvailable = {}; // { 'light': true/false, 'dark': true/false }

// OPTIMIZATION: Get icon URL with browser theme (reusable helper)
async function getIconUrl() {
  const browserTheme = await getBrowserTheme();
  return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}.png`);
}

// Initialize error icon availability cache at startup
export async function initializeErrorIconCache() {
  // Check both themes once at startup instead of fetching on every error
  for (const theme of ['light', 'dark']) {
    try {
      const response = await fetch(chrome.runtime.getURL(`/images/icon-128x128-${theme}-error.png`));
      errorIconsAvailable[theme] = response.ok;
    } catch (e) {
      errorIconsAvailable[theme] = false;
    }
  }
}

// OPTIMIZATION: Get error icon URL with fallback to regular icon (cached check)
async function getIconErrorUrl() {
  const browserTheme = await getBrowserTheme();

  // Use cached check result (populated at startup by initializeErrorIconCache)
  if (errorIconsAvailable[browserTheme]) {
    return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}-error.png`);
  }

  // Fall back to regular icon if error icon doesn't exist
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
