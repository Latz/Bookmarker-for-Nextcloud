import getDescription from './getDescription.js';
import getKeywords from './getKeywords.js';
import { getFolders } from './getFolders.js';
import { parseHTML } from 'linkedom';
import apiCall from '../../lib/apiCall.js';
import { getOption } from '../../lib/storage.js';
import log from '../../lib/log.js';

const DEBUG = false;

export default async function getData() {
  let content = '';
  let data = { ok: true };

  // unable to not get content, for example "chrome://" or
  try {
    content = await getContent();
  } catch (error) {
    data = {
      ok: false,
      error: error.message,
    };
  }
  if (!data.ok) {
    return data;
  }
  const { document } = parseHTML(content);

  // --- get some basic stuff
  const activeTab = await chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0]);
  data.url = activeTab.url;

  data.title = activeTab.title;
  data.description = getDescription(document);
  data.keywords = await getKeywords(document);
  log(DEBUG, ':: ~ getData ~ data.keywords:', data.keywords);
  data.checkBookmark = await checkBookmark(data.url);
  data.folders = await getFolders();

  log(DEBUG, 'data', data);
  // Check if the url is already stored.
  // If the connection succeeded and the url was found the use stored data.
  if (data.checkBookmark.ok && data.checkBookmark.found) {
    // I'm using a different vocabulary
    data.checkBookmark.keywords = data.checkBookmark.tags;
    data.checkBookmark.folders = data.folders; // Don't forget the folders
    data.checkBookmark.bookmarkID = data.checkBookmark.id;
    data = data.checkBookmark;
    return data;
  } else {
    // If the connection was unsuccesful or the url was not found
    // mark it by setting the bookmark id to "-1"
    data.bookmarkID = -1;
    log(DEBUG, 'data', data);
    return data;
  }
}

/**
 * Retrieves the content of the active tab in the Chrome browser.
 *
 * @returns {Promise<string>} The HTML content of the active tab.
 */
async function getContent() {
  // Query the active tab in the current window
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  // Execute a script in the active tab to retrieve the HTML content
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    func: () => document.documentElement.innerHTML,
  });

  // Return the HTML content
  return injectionResults[0].result;
}

// ---------------------------------------------------------------------------------------------------
async function checkBookmark(url) {
  // Check if the user wants to check for stored bokmarks
  // -> Fake successful connection and no data found
  const checkAlreadyStored = await getOption('cbx_alreadyStored');

  if (!checkAlreadyStored) return { ok: true, found: false };

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = 'GET';
  const data = new URLSearchParams({ url, page: -1 }).toString();
  const result = await apiCall(endpoint, method, data);

  // if the server responded check if any data was received
  // true  -> bookmark found, get data and mark as found
  // false -> no bookmark found, use blank data, mark as not found
  // finally mark as successful request
  let response = {};
  log(DEBUG, 'result', result);
  if (result.status === 'success') {
    if (result.data.length > 0) {
      response = result.data[0];
      response.found = true;
    }
    response.ok = true;
  } else {
    // connection timed out, mark as unsuccessful
    log(DEBUG, 'result', result);
    response.ok = false;
  }
  log(DEBUG, 'response', response);
  return response;
}
