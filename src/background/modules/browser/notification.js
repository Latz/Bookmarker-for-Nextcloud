// Desktop notifications shown by the service worker: save success, save/API
// errors and cache refresh. Icons follow the browser theme.
import { getOption } from '../../../lib/storage.js';
import getBrowserTheme from './getBrowserTheme.js';

// OPTIMIZATION: Constant for notification title (avoid repetition)
const NOTIFICATION_TITLE = 'Bookmarker for Nextcloud';

// Cache which themes have error icons (checked once at startup)
let errorIconsAvailable = {}; // { 'light': true/false, 'dark': true/false }

/**
 * Reset error icon availability cache — for test isolation only.
 * @param {{light?: boolean, dark?: boolean}} [cache] - State to start from.
 */
export function _resetErrorIconCacheForTesting(cache = {}) {
  errorIconsAvailable = cache;
}

/**
 * URL of the regular notification icon for the current browser theme.
 * @returns {Promise<string>}
 */
async function getIconUrl() {
  const browserTheme = await getBrowserTheme();
  return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}.png`);
}

/**
 * Finds out which themes ship a `-error` icon variant and remembers the answer
 * (in memory and in session storage), so showing an error never has to probe
 * for the file. Called once from init().
 * @returns {Promise<void>}
 */
export async function initializeErrorIconCache() {
  // Try session storage first (persists across SW termination)
  if (chrome.storage?.session) {
    try {
      const stored = await chrome.storage.session.get('errorIconsAvailable');
      const s = stored.errorIconsAvailable;
      if (s && typeof s.light === 'boolean' && typeof s.dark === 'boolean') {
        errorIconsAvailable = s;
        return;
      }
    } catch (error) {
      console.warn(
        '[notification] Session storage unavailable, falling back:',
        error.message,
      );
    }
  }

  // Full check via fetch (runs once per browser session when SW first cold-starts).
  // Both themes are probed in parallel -- they are independent, and this sits on
  // the cold-start path.
  const themes = ['light', 'dark'];
  const results = await Promise.all(
    themes.map(async (theme) => {
      try {
        const response = await fetch(
          chrome.runtime.getURL(`/images/icon-128x128-${theme}-error.png`),
        );
        return response.ok;
      } catch (e) {
        // Fetching a file the extension does not ship rejects ("Failed to
        // fetch") instead of returning a 404. The error variants are optional,
        // so this is the expected "not available" answer, not a fault.
        console.debug('[notification] no error icon for theme', theme, e);
        return false;
      }
    }),
  );
  themes.forEach((theme, i) => {
    errorIconsAvailable[theme] = results[i];
  });

  // Persist result to session storage
  if (chrome.storage?.session) {
    chrome.storage.session
      .set({ errorIconsAvailable: { ...errorIconsAvailable } })
      .catch(() => {});
  }
}

/**
 * URL of the error icon for the current browser theme, or of the regular icon
 * if that theme has no error variant.
 * @returns {Promise<string>}
 */
async function getIconErrorUrl() {
  const browserTheme = await getBrowserTheme();

  // Use cached check result (populated at startup by initializeErrorIconCache)
  if (errorIconsAvailable[browserTheme]) {
    return chrome.runtime.getURL(
      `/images/icon-128x128-${browserTheme}-error.png`,
    );
  }

  // Fall back to regular icon if error icon doesn't exist
  return chrome.runtime.getURL(`/images/icon-128x128-${browserTheme}.png`);
}

/**
 * Tells the user how an API call went.
 *
 * Errors are always shown and stay until dismissed (requireInteraction);
 * success is a short-lived notification that the user can turn off in the
 * options (cbx_successMessage).
 *
 * @param {{status: string, statusText?: string}} response - The apiCall result.
 *   Anything with `status === 'error'` is treated as a failure, everything
 *   else as success.
 * @returns {Promise<void>}
 */
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

/**
 * Closes a notification. Bound to notifications.onButtonClicked (the error
 * notification's "Dismiss" button) and onClicked in background.js: the error
 * notification has requireInteraction, so without a handler the button did
 * nothing and the notification stayed on screen until closed by hand.
 * @param {string} notificationId
 */
export function dismissNotification(notificationId) {
  try {
    // clear() returns a promise in MV3; a rejection (already gone) is harmless
    chrome.notifications.clear(notificationId)?.catch?.(() => {});
  } catch {
    // notifications unavailable
  }
}

/**
 * Confirms a manual cache refresh with a plain notification.
 * @returns {Promise<void>}
 */
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
