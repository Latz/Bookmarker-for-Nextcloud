// @ts-check
import getData from './modules/getData.js';
import { zenMode } from './modules/zenMode.js';
import { saveBookmark } from './modules/saveBookmark.js';
import { handleContextMenuClick } from './modules/contextMenu.js';
import { maxAttemptsError } from './modules/loginTimeout.js';
import { init } from './modules/startup.js';

// -----------------------------------------------------------------------------------------------
console.log('init background');

// ------------------------------------------------------------------------------------------------
// Both listeners are registered synchronously at top level, before anything is
// awaited, so Chrome delivers their events reliably on SW cold-starts (MV3
// requires that).

// Message center
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // No externally_connectable and no content scripts are declared, so only
  // this extension's own pages can reach this listener today -- this check
  // just pins that invariant rather than relying on it implicitly.
  if (sender.id !== chrome.runtime.id) return false;
  switch (request.msg) {
    case 'saveBookmark':
      saveBookmark(request.parameters, request.folderIDs, request.bookmarkID);
      break;
    case 'getData':
      (async () => sendResponse(await getData(request.data)))();
      // Only this branch answers asynchronously, so only this branch needs the
      // message channel held open.
      return true;
    case 'authorize':
      chrome.tabs.create({
        url: 'login/login.html',
      });
      break;
    case 'maxAttempts':
      maxAttemptsError(request.loginPage);
      break;
    case 'zenMode':
      zenMode();
      break;
  }
  return false;
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// ------------------------------------------------------------------------------------------------
// Initialize extension. Not top-level awaited: service workers disallow top-level
// await. Both listeners above are registered synchronously first, so events
// arriving during init are still delivered (MV3 requires that on SW cold start).
init().catch((error) => {
  console.error('[background] init failed:', error);
});
