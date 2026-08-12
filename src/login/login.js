// @ts-check
// https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/index.html

import apiCall from '../lib/apiCall.js';
import { store_data } from '../lib/storage.js';

// Simple HTTP status code to reason phrase mapping (replaces http-status-codes dependency)
const httpStatusReasons = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

function getReasonPhrase(statusCode) {
  return httpStatusReasons[statusCode] || 'Unknown Status';
}

/**
 * True when the entered server address explicitly uses a non-https scheme.
 *
 * The Login Flow v2 exchange returns the app password in its response body,
 * and every API call afterwards sends it as a Basic auth header -- both cross
 * the network in cleartext for anything other than https.
 *
 * Only an explicit scheme is checked. A bare hostname (no "xxx://" prefix) is
 * left untouched here, matching existing behaviour -- normalizing it is a
 * separate concern from rejecting an explicitly insecure one.
 *
 * @param {string} input - Raw value of the #serverName field.
 * @returns {boolean} True if the address names a scheme other than https.
 */
function isInsecureServerUrl(input) {
  const match = input.trim().match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return !!match && match[1].toLowerCase() !== 'https';
}
document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    document.getElementById('msg').innerText = '';
    document.getElementById('testServer').textContent =
      chrome.i18n.getMessage('OpenLoginPage');

    document.getElementById('testServer').addEventListener('click', () => {
      openServerPage();
    });

    document
      .getElementById('serverName')
      .addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          openServerPage();
        }
      });
  }
};

async function openServerPage() {
  // clear possible error message
  document.getElementById('error').textContent = '';
  document.getElementById('msg').textContent = '';

  const testServer = document.getElementById('testServer');
  const host = document.getElementById('serverName').value;

  if (isInsecureServerUrl(host)) {
    document.getElementById('error').innerText =
      `${chrome.i18n.getMessage('InsecureServerUrl')}!`;
    document.getElementById('serverName').focus();
    return;
  }

  testServer.textContent = `${chrome.i18n.getMessage('Loading')}...`;

  const endpoint = 'index.php/login/v2';
  const method = 'POST';

  try {
    const response = await apiCall(endpoint, method, {
      host,
      loginflow: true,
    });
    response.login ? loginPoll(response) : serverError(response);
  } catch (e) {
    console.log('!', e);
  }
}

async function loginPoll(request) {
  let authorized = false;
  let authCheck;

  // add maximum number of attempts to avoid infinite loop if the user leaves the tab
  // without logging in
  const maxAttempts = 300;
  let attempts = 0;

  // remember login page id so that we can close it If there was an time.
  const loginPage = await chrome.tabs.create({ url: request.login });
  console.log('🚀 ~ loginPoll ~ loginPage:', loginPage);

  while (!authorized && attempts < maxAttempts) {
    try {
      authCheck = await fetch(request.poll.endpoint, {
        credentials: 'omit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: request.poll.value,
        },
        body: `token=${request.poll.token}`,
      });
      authorized = authCheck.ok;
    } catch (e) {
      console.log('!!!', e);
    }
    // put a little pause between requests
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000);
    });
    attempts++;
  }

  // User did not interact after maxAttempts iterations
  if (maxAttempts === attempts) {
    chrome.runtime.sendMessage({ msg: 'maxAttempts', loginPage });
    document.getElementById('testServer').textContent =
      chrome.i18n.getMessage('OpenLoginPage');
    document.getElementById('serverName').focus();
  } else {
    // Otherwise, save login credentials.
    let response = await authCheck.json();
    store_data('credentials', {
      appPassword: response.appPassword,
      loginname: response.loginName,
      server: response.server,
    });
  }
}

function serverError(response) {
  // display error message
  const msg = document.getElementById('msg');
  const errorDiv = document.getElementById('error');
  const testServer = document.getElementById('testServer');

  errorDiv.innerText = `${chrome.i18n.getMessage('LoginServerError')}!`;

  if (response.status > 0) {
    msg.innerText = `${response.status}  - ${getReasonPhrase(response.status)}`;
  } else if (response.statusText) {
    msg.innerText = ` ${response.statusText}`;
  }
  testServer.textContent = chrome.i18n.getMessage('OpenLoginPage');
  document.getElementById('serverName').focus();
}
