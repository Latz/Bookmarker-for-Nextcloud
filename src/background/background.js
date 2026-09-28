// @ts-check
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

const logError = (label) => (error) =>
  console.error(`[background] ${label} failed:`, error);

// Message center
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // No externally_connectable and no content scripts are declared, so only
  // this extension's own pages can reach this listener today -- this check
  // just pins that invariant rather than relying on it implicitly.
  if (sender.id !== chrome.runtime.id) return false;
  switch (request.msg) {
    case 'saveBookmark':
      saveBookmark(
        request.parameters,
        request.folderIDs,
        request.bookmarkID,
      ).catch(logError('saveBookmark'));
      break;
    case 'getData':
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
      maxAttemptsError(request.loginPage);
      break;
    case 'zenMode':
      zenMode().catch(logError('zenMode'));
      break;
  }
  return false;
});

// Context menu click handler
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
