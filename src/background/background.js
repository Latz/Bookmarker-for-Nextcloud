// @ts-check
// -----------------------------------------------------------------------------
// Service worker entry point (Manifest V3).
//
// This file only wires things together: it registers the event listeners that
// route messages / clicks to the feature modules and then kicks off `init()`.
// All real work lives in ./modules/*.
//
// MV3 service workers are terminated after ~30s of inactivity and re-started
// on the next event. That means this whole file runs again on every cold
// start, and every module-level variable is reset (see the session-storage
// caches in the modules for how that cost is reduced).
// -----------------------------------------------------------------------------
import getData from './modules/bookmarks/getData.js';
import { zenMode } from './modules/bookmarks/zenMode.js';
import { saveBookmark } from './modules/bookmarks/saveBookmark.js';
import { handleContextMenuClick } from './modules/browser/contextMenu.js';
import { dismissNotification } from './modules/browser/notification.js';
import { maxAttemptsError } from './modules/loginTimeout.js';
import { init } from './modules/startup.js';
import { clearApiCallCache } from '../lib/apiCall.js';

// -----------------------------------------------------------------------------------------------
console.log('init background');

// ------------------------------------------------------------------------------------------------
// Both listeners are registered synchronously at top level, before anything is
// awaited, so Chrome delivers their events reliably on SW cold-starts (MV3
// requires that).

/**
 * Builds a rejection handler for fire-and-forget promises, so a failure in one
 * of the message branches is logged with a label instead of ending up as an
 * unhandled promise rejection.
 * @param {string} label - Name of the operation, shown in the log line.
 * @returns {(error: unknown) => void}
 */
const logError = (label) => (error) =>
  console.error(`[background] ${label} failed:`, error);

// Message center: every other part of the extension (popup, login page,
// options page) talks to the service worker through `chrome.runtime.sendMessage`
// with a `msg` discriminator, handled in the switch below.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // No externally_connectable and no content scripts are declared, so only
  // this extension's own pages can reach this listener today -- this check
  // just pins that invariant rather than relying on it implicitly.
  if (sender.id !== chrome.runtime.id) return false;
  switch (request.msg) {
    case 'saveBookmark':
      // Fire-and-forget: the popup closes right after sending this, so there
      // is nobody to send a response to. Errors are surfaced by saveBookmark
      // itself via a notification; here they are only logged.
      saveBookmark(
        request.parameters,
        request.folderIDs,
        request.bookmarkID,
      ).catch(logError('saveBookmark'));
      break;
    case 'getData':
      // Collects title, description, keywords, folders and existing-bookmark
      // info for the popup. Answered asynchronously (see `return true` below).
      (async () => {
        try {
          sendResponse(await getData(request.data));
        } catch (error) {
          // The channel is held open below, so it must always be answered --
          // otherwise the popup waits until the service worker is terminated.
          console.error('[background] getData failed:', error);
          sendResponse({
            ok: false,
            error: error?.message ?? String(error),
          });
        }
      })();
      // Only this branch answers asynchronously, so only this branch needs the
      // message channel held open.
      return true;
    case 'authorize':
      // Opens the login page in a new tab (the Nextcloud login flow v2 runs there).
      chrome.tabs
        .create({
          url: 'login/login.html',
        })
        .catch(logError('authorize'));
      break;
    case 'credentialsChanged':
      // Login / "forget credentials" happened in another context; the cached
      // auth header here would keep the old credentials for up to a minute.
      clearApiCallCache();
      break;
    case 'maxAttempts':
      // The login page gave up polling for the app token; replace its form
      // with a "timeout" message.
      maxAttemptsError(request.loginPage);
      break;
    case 'zenMode':
      // One-click save of the current page with the pre-configured zen
      // folders/keywords, without opening the popup.
      zenMode().catch(logError('zenMode'));
      break;
  }
  // No response is sent for any other message, so the channel can be closed.
  return false;
});

// Context menu click handler (right-click "save bookmark" entries)
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// The error notification's "Dismiss" button (and a click on the notification)
chrome.notifications.onButtonClicked.addListener(dismissNotification);
chrome.notifications.onClicked.addListener(dismissNotification);

// ------------------------------------------------------------------------------------------------
// Initialize extension. Not top-level awaited: service workers disallow top-level
// await. Both listeners above are registered synchronously first, so events
// arriving during init are still delivered (MV3 requires that on SW cold start).
init().catch((error) => {
  console.error('[background] init failed:', error);
});
