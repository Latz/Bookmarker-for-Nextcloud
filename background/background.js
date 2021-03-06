//@ts-check

import { load_data, store_data, delete_data } from '../lib/storage.js';
import { CacheGet, CacheAdd, CacheTempAdd } from './cache.js';
import apiCall from '../lib/apiCall.js';

// check for Firefox and add Options menu to browser action menu
// https://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser/9851769#9851769
// @ts-ignore
if (typeof InstallTrigger !== 'undefined') {
  let icon = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'settings-dark.svg' : 'settings.svg';
  browser.contextMenus.create({
    title: 'Options',
    contexts: ['browser_action'],
    icons: {
      16: `./images/${icon}`,
    },
    onclick: () => {
      browser.runtime.openOptionsPage();
    },
  });
}

// set light icon if dark mode ist enabled
// browser does not support theme_icons in manifest.json
if (window.matchMedia('(prefers-color-scheme: dark)').matches)
  browser.browserAction.setIcon({ path: '../images/icon-64x64-dark.png' });
else browser.browserAction.setIcon({ path: '../images/icon-64x64-light.png' });

// Check if addon has been updated -> delete cache
browser.runtime.onInstalled.addListener((reason) => {
  if (reason.reason === 'update') {
    // check if server is defined before trying to load the tags
    load_data('credentials', 'server').then((server) => {
      if (server !== undefined) getTags(true); // force update
    });
  }
});

// check if tags and folder tags cache has expired and update
// on browser start
getTags();
loadFolders();
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.msg) {
    case 'poll':
      poll_login(request);
      break;
    case 'checkBookmark':
      checkBookmark(request.data).then((response) => sendResponse(response));
      break;
    case 'getTags':
      getTags().then((response) => sendResponse(response));
      break;
    case 'saveBookmark':
      saveBookmark(request.data).then((response) => sendResponse(response));
      break;
    case 'loadFolders':
      loadFolders().then((response) => sendResponse(response));
      break;
    case 'getContent':
      getContent().then((content) => sendResponse(content));
  } //switch
  return true;
});
// ------------------------------------------------------------------------------------
async function checkBookmark(pageUrl) {
  // Check if the bookmark i already stored in the database
  // true  => return database entries
  // false => do nothing
  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = 'GET';
  const response = await apiCall(endpoint, method, `url=${pageUrl}`);

  return new Promise((resolve) => resolve(response));
}
// ------------------------------------------------------------------------------------
async function poll_login(request) {
  let windowClosed = false;
  let authorized = false;
  let authCheck;

  let loginTab = await browser.tabs.create({ url: request.login });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (loginTab.id === tabId) windowClosed = true;
  });

  while (!authorized && !windowClosed) {
    // put a little pause between requests
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000);
    });
    try {
      authCheck = await fetch(request.endpoint, {
        credentials: 'omit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: request.host.value,
        },
        body: `token=${request.token}`,
      });
      if (authCheck.ok) authorized = true;
    } catch (e) {
      console.log('e', e);
    }
  }
  let response = await authCheck.json();
  store_data('credentials', {
    appPassword: response.appPassword,
    loginname: response.loginName,
    server: response.server,
  });
  getTags();
  loadFolders();
}
// ------------------------------------------------------------------------------------
async function getTags(forceUpdate = false) {
  console.log('getTags');
  if (!forceUpdate) {
    const tags = await CacheGet('tags');
    if (Object.keys(tags).length > 0) return new Promise((resolve) => resolve(tags.value.sort()));
  }
  const response = await apiCall('index.php/apps/bookmarks/public/rest/v2/tag', 'GET');
  CacheAdd('tags', response.sort());
  return new Promise((resolve) => resolve(response));
}
// ------------------------------------------------------------------------------------------------
async function saveBookmark(data) {
  let tags = '';
  let tagsArray = JSON.parse(data.tags);
  tagsArray.forEach((tag) => (tags += `&tags[]=${tag.value}`));

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = 'POST';
  const description = data.notes.length > 0 ? `&description=${data.notes}` : '';
  const folders = data.folders.length > 0 ? `&folders[]=${data.folders}` : '';
  const parameters = `title=${data.title}&url=${data.url}${description}${tags}${folders}&page=-1`;

  console.log(parameters);
  const response = await apiCall(endpoint, method, parameters);

  if (response.status !== 'success') {
    browser.notifications.create('', {
      title: 'Error saving bookmark!',
      message: `Error: ${response.statusText}`,
      iconUrl: '../images/icon-128x128-light.png',
      type: 'basic',
    });
  }
  updateLocalTags(tagsArray);

  return new Promise((resolve) => resolve(response));
}
// --------------------------------------------------------------------------------------------------
// Tags are cached for a day. If the user adds a new Tag it needs to be added to the cache.
async function updateLocalTags(tags) {
  let cachedTags = await CacheGet('tags');
  tags.forEach((tag) => {
    if (cachedTags.value.indexOf(tag.value) < 0) cachedTags.value.push(tag.value);
  });
  CacheTempAdd('tags', tags);
}
// --------------------------------------------------------------------------------------------------
async function loadFolders() {
  // TODO: Don't forget to cache the folders

  let folders = await CacheGet('folders');
  if (Object.keys(folders).length > 0) return new Promise((resolve) => resolve(folders.value));

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/folder';
  const method = 'GET';
  let response = await apiCall(endpoint, method);
  CacheAdd('folders', response.data);
  return new Promise((resolve) => resolve(response.data));
}
// -----------------------------------------------------------------------------------------------------
async function getContent() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  let content = await browser.tabs.sendMessage(tabs[0].id, { msg: 'getContent' });
  return new Promise((resolve) => resolve(content));
}
