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
  504: 'Gateway Timeout',
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
  const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(input.trim());
  return !!match && match[1].toLowerCase() !== 'https';
}

/**
 * Adds an https:// scheme to a bare hostname, leaving an already-schemed
 * address untouched.
 *
 * chrome.permissions.request() requires a scheme-qualified match pattern, and
 * apiCall's fetch() calls need a valid absolute URL -- a bare hostname is
 * neither. Must run *after* isInsecureServerUrl, which checks the raw input:
 * normalizing first could turn an explicit "http://host" into
 * "https://http://host" if not careful, so the explicit-scheme rejection has
 * to see the untouched string.
 *
 * @param {string} input - Raw or already-validated value of the #serverName field.
 * @returns {string} A scheme-qualified server address.
 */
function normalizeServerHost(input) {
  const trimmed = input.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
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
          // A held-down Enter would restart the flow (and reopen the login tab)
          // on every auto-repeat.
          if (!event.repeat) openServerPage();
        }
      });
  }
};

// Each click/Enter starts a new login flow. Only the latest may keep polling:
// without this, every click left another poll loop (up to 300 s) and another
// login tab behind.
let currentFlow = 0;
let currentLoginTabId = null;

async function openServerPage() {
  const flow = ++currentFlow;
  // clear possible error message
  document.getElementById('error').textContent = '';
  document.getElementById('msg').textContent = '';

  const testServer = document.getElementById('testServer');
  const rawHost = document.getElementById('serverName').value;

  if (isInsecureServerUrl(rawHost)) {
    document.getElementById('error').innerText =
      `${chrome.i18n.getMessage('InsecureServerUrl')}!`;
    document.getElementById('serverName').focus();
    return;
  }

  const host = normalizeServerHost(rawHost);

  // The extension holds no static host permission for an arbitrary
  // self-hosted Nextcloud domain -- request access scoped to exactly this
  // origin before the first network call to it. This must run inside the
  // click/keydown handler's call chain (no permission-changing awaits before
  // it) to satisfy Chrome's user-gesture requirement.
  //
  // Only gate on this when a real origin can be derived. Empty or otherwise
  // unparseable input (e.g. the field left blank) is not a new case this fix
  // needs to own: it falls through to apiCall exactly as before, which fails
  // there with its own pre-existing error surface for invalid input.
  let origin = null;
  try {
    origin = new URL(host).origin;
  } catch (e) {
    origin = null;
  }

  if (origin) {
    let granted;
    try {
      granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    } catch (e) {
      granted = false;
    }
    if (!granted) {
      document.getElementById('error').innerText =
        `${chrome.i18n.getMessage('PermissionRequestDenied')}!`;
      document.getElementById('serverName').focus();
      return;
    }
  }

  testServer.textContent = `${chrome.i18n.getMessage('Loading')}...`;

  const endpoint = 'index.php/login/v2';
  const method = 'POST';

  try {
    const response = await apiCall(endpoint, method, {
      host,
      loginflow: true,
    });
    if (flow !== currentFlow) return; // superseded while the request was running
    if (!response.login) {
      serverError(response);
    } else if (!isTrustedLoginResponse(response, host)) {
      // Login Flow v2 sends the poll token to response.poll.endpoint; a server
      // that points it elsewhere (or at plain http) would receive that token.
      serverError({ statusText: 'Unexpected login flow response' });
    } else {
      await loginPoll(response, flow);
    }
  } catch (e) {
    console.log('!', e);
  }
}

/**
 * The poll endpoint and login page must be https and on the server the user
 * entered. The extension only holds host permission for that origin, so a
 * different one could not be polled anyway.
 * @param {{login?: string, poll?: {endpoint?: string, token?: string}}} response
 * @param {string} host - The normalized server address the user entered.
 * @returns {boolean}
 */
function isTrustedLoginResponse(response, host) {
  try {
    const origin = new URL(host).origin;
    const endpoint = new URL(response.poll?.endpoint ?? '');
    const login = new URL(response.login ?? '');
    return (
      Boolean(response.poll?.token) &&
      endpoint.protocol === 'https:' &&
      endpoint.origin === origin &&
      login.protocol === 'https:' &&
      login.origin === origin
    );
  } catch {
    return false;
  }
}

async function loginPoll(request, flow) {
  let authorized = false;
  let authCheck;

  // add maximum number of attempts to avoid infinite loop if the user leaves the tab
  // without logging in
  const maxAttempts = 300;
  let attempts = 0;

  // A previous, abandoned attempt's login tab would otherwise stay open
  if (currentLoginTabId !== null) {
    await chrome.tabs.remove(currentLoginTabId).catch(() => {});
  }

  // remember login page id so that we can close it If there was an time.
  const loginPage = await chrome.tabs.create({ url: request.login });
  currentLoginTabId = loginPage.id;

  while (!authorized && attempts < maxAttempts && flow === currentFlow) {
    try {
      authCheck = await fetch(request.poll.endpoint, {
        credentials: 'omit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
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

  // A newer login attempt took over; it owns the UI and the login tab now.
  if (flow !== currentFlow) return;
  currentLoginTabId = null;

  // User did not interact after maxAttempts iterations
  if (!authorized) {
    chrome.runtime.sendMessage({ msg: 'maxAttempts', loginPage });
    document.getElementById('testServer').textContent =
      chrome.i18n.getMessage('OpenLoginPage');
    document.getElementById('serverName').focus();
    return;
  }

  // Otherwise, save login credentials.
  try {
    const response = await authCheck.json();
    if (!response?.appPassword || !response?.loginName || !response?.server) {
      throw new Error('Incomplete login response');
    }
    await store_data('credentials', {
      appPassword: response.appPassword,
      loginname: response.loginName,
      server: response.server,
    });
  } catch (error) {
    // Nothing was stored: say so instead of leaving the user waiting.
    console.error('[login] could not save the credentials:', error);
    serverError({ statusText: error?.message ?? String(error) });
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
