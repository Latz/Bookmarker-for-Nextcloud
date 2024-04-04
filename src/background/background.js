import apiCall from '../lib/apiCall.js';
import getData from './modules/getData.js';
import { store_data, createOldDatabase } from '../lib/storage.js';
import { notifyUser } from './modules/notification.js';
import getBrowserTheme from './modules/getBrowserTheme.js';
import { cacheGet } from '../lib/cache.js';

const DEBUG = false;
// -----------------------------------------------------------------------------------------------
// Initialize extension
init();

// ------------------------------------------------------------------------------------------------
// Message center
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.msg) {
    case 'saveBookmark':
      saveBookmark(request.parameters, request.folderIDs, request.bookmarkID);
      break;
    case 'getData':
      getData(request.data).then((data) => sendResponse(data));
      break;
    case 'authorize':
      chrome.tabs.create({
        url: 'login/login.html',
      });
      break;
    case 'maxAttempts':
      maxAttemptsError(request.loginPage);
      break;
  }
  return true;
});

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

function init() {
  const message = chrome.i18n.getMessage('options');

  getBrowserTheme().then((browserTheme) => {
    chrome.action.setIcon({
      path: {
        64: `/images/icon-64x64-${browserTheme}.png`,
        256: `/images/icon-256x256-${browserTheme}.png`,
        128: `/images/icon-128x128-${browserTheme}.png`,
        512: `/images/icon-512x512-${browserTheme}.png`,
      },
    });
  });

  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'menuRefreshCache',
    title: 'Refresh Cache',
    contexts: ['action'],
  });

  // only for development purposes
  // chrome.contextMenus.create({
  //   id: 'menuOldDatabase',
  //   title: 'Create old database',
  //   contexts: ['action'],
  // });

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'menuRefreshCache') {
      cacheGet('keywords', true);
      cacheGet('folders', true);
    }
    if (info.menuItemId === 'menuOldDatabase') {
      createOldDatabase();
    }
  });
}

function insertTimeOutMessage() {
  const loginForm = document.getElementById('login-form');
  const appTokenLogin = document.getElementById('app-token-login');
  loginForm.innerHTML = '';
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
  appTokenLogin.innerHTML = '';
}

function maxAttemptsError(loginPage) {
  const tabId = loginPage.id;

  chrome.scripting
    .executeScript({
      target: { tabId },
      func: insertTimeOutMessage,
    })
    .then(() => {})
    .catch((e) => {
      console.log('!!!', e);
    });
}
