// @ts-check
import apiCall from '../lib/apiCall.js';
import getData from './modules/getData.js';
import {
  store_data,
  createOldDatabase,
  getOption,
  load_data,
} from '../lib/storage.js';
import { notifyUser, initializeErrorIconCache } from './modules/notification.js';
import getBrowserTheme from './modules/getBrowserTheme.js';
import { cacheGet } from '../lib/cache.js';
import { zenMode } from './modules/zenMode.js';

const DEBUG = false;
// -----------------------------------------------------------------------------------------------
// Initialize extension
console.log('init background');
init();

// ------------------------------------------------------------------------------------------------
// Message center
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

// ------------------------------------------------------------------------------------------------
// Context menu click handler — registered at top level so Chrome delivers the event
// reliably on SW cold-starts (MV3 requires synchronous listener registration).
// This function is only necessary because Vivaldi does not display the check mark in context menus.
function setZenModeMenu(zenModeEnabled) {
  console.log('zenModeEnabled', zenModeEnabled);
  try {
    if (zenModeEnabled) {
      chrome.contextMenus.update('menuEnableZen', {
        title: '⭢Zen Mode',
        checked: true,
      });
    } else {
      chrome.contextMenus.update('menuEnableZen', {
        title: 'Zen Mode',
        checked: false,
      });
    }
  } catch (error) {
    // Menu item may not exist yet if SW cold-started for this event
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'menuRefreshCache') {
    cacheGet('keywords', true);
    cacheGet('folders', true);
  }
  if (info.menuItemId === 'menuOldDatabase') {
    createOldDatabase();
  }
  if (info.menuItemId === 'menuEnableZen') {
    if (info.checked) {
      store_data('options', { cbx_enableZen: true }).catch(() => {});
    } else {
      store_data('options', { cbx_enableZen: false }).catch(() => {});
    }
    setZenModeMenu(info.checked);
  }
});

// ------------------------------------------------------------------------------------------------
/**
 * Saves a bookmark by making an API call to create a new bookmark or update an existing one.
 * It also stores the last selected folders and displays a notification to the user based on the response from the API call.
 * @param {object} data - The data of the bookmark to be saved.
 * @param {array} folderIDs - The IDs of the folders where the bookmark should be saved.
 * @param {number} bookmarkID - The ID of the bookmark to be updated, if it exists.
 * @returns {Promise<void>}
 */
async function saveBookmark(data, folderIDs, bookmarkID) {
  const endpoint =
    bookmarkID > 0
      ? `index.php/apps/bookmarks/public/rest/v2/bookmark/${bookmarkID}`
      : 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = bookmarkID > 0 ? 'PUT' : 'POST';

  chrome.action.setBadgeText({ text: '💾' });
  const response = await apiCall(endpoint, method, data);

  await store_data('options', { folderIDs });
  chrome.action.setBadgeText({ text: '' });
  notifyUser(response);
}

// ------------------------------------------------------------------------------------------------
// initialize extension
// ------------------------------------------------------------------------------------------------

/**
 * Sets the toolbar icon to match the browser theme.
 *
 * Only 16/32/64/128 are supplied: Chrome renders the action icon at 16px
 * (32px at 2x DPR) and downsamples whatever it is given, so handing it the
 * 512x512 asset meant decoding 50 KB on every worker start for a 16px slot --
 * slower and blurrier than providing the intended size.
 *
 * Falls back to the manifest default (light) if theme detection fails.
 * @returns {Promise<void>}
 */
async function applyThemedIcon() {
  try {
    const browserTheme = await getBrowserTheme();
    await chrome.action.setIcon({
      path: {
        16: `/images/icon-16x16-${browserTheme}.png`,
        32: `/images/icon-32x32-${browserTheme}.png`,
        64: `/images/icon-64x64-${browserTheme}.png`,
        128: `/images/icon-128x128-${browserTheme}.png`,
      },
    });
  } catch (error) {
    console.error('Failed to detect browser theme, using default:', error);
  }
}

async function init() {
  // Kick the connection warm-up off first. It is fire-and-forget, and
  // everything below is local work that would otherwise delay the very thing
  // this call exists to do early.
  warmupConnection().catch(() => {});

  // These three are mutually independent -- running them in sequence just made
  // the worker slower to reach the point where it can answer a getData
  // message, on every cold start.
  const [, , zenModeEnabled] = await Promise.all([
    applyThemedIcon(),
    initializeErrorIconCache(),
    getOption('cbx_enableZen'),
  ]);

  chrome.contextMenus.removeAll();
  try {
    chrome.contextMenus.create({
      id: 'menuEnableZen',
      title: 'Zen Mode',
      contexts: ['action'],
      type: 'checkbox',
      checked: zenModeEnabled,
    });
  } catch (error) {
    console.log(error);
  }
  setZenModeMenu(zenModeEnabled);

  try {
    chrome.contextMenus.create({
      id: 'menuRefreshCache',
      title: 'Refresh Cache',
      contexts: ['action'],
    });
  } catch (error) {
    console.log(error);
  }

  // only for development purposes
  // chrome.contextMenus.create({
  //   id: 'menuOldDatabase',
  //   title: 'Create old database',
  //   contexts: ['action'],
  // });
}


/**
 * Warms up the connection to the Nextcloud server on SW startup.
 * Primes the TCP/TLS connection, auth header cache, and network timeout cache.
 * Fire-and-forget — errors are silently ignored.
 */
async function warmupConnection() {
  // `load_data` unwraps single-item reads (storage.js), so this resolves to the
  // server URL string itself — not an object with a `server` property.
  const server = await load_data('credentials', 'server');
  if (!server) return;

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const data = new URLSearchParams({ page: 0, limit: 1 }).toString();
  await apiCall(endpoint, 'GET', data);
}

function insertTimeOutMessage() {
  const loginForm = document.getElementById('login-form');
  const appTokenLogin = document.getElementById('app-token-login');
  loginForm.replaceChildren();
  const msg = document.createElement('div');
  msg.setAttribute(
    'style',
    'text-size: 1.2em; font-weight: 600; margin-bottom: 30px;',
  );
  msg.innerText =
    'Timeout. Please close this tab and authorize the  extension again.';
  loginForm.appendChild(msg);
  const button = document.createElement('button');
  button.setAttribute('class', 'login primary');
  button.setAttribute('style', 'padding: 0 30px 0 30px');
  button.innerText = 'Close';
  document.addEventListener('click', (event) => {
    window.close();
  });
  loginForm.appendChild(button);

  loginForm.removeAttribute('action'); // reset default action
  loginForm.removeAttribute('method'); // reset default action
  appTokenLogin.replaceChildren();
}

async function maxAttemptsError(loginPage) {
  const tabId = loginPage.id;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: insertTimeOutMessage,
    });
  } catch (e) {
    console.log('!!!', e);
  }
}
