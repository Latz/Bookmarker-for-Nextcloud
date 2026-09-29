// @ts-check
// Single entry point for all requests to the Nextcloud Bookmarks REST API.
// Handles server URL + Basic-auth lookup, a configurable timeout and turns
// every failure into a `{ status: 'error', statusText }` result, so callers
// never have to deal with thrown errors.
import { getOption, load_data } from './storage.js';
import { timeoutMilliseconds } from './networkTimeout.js';

// OPTIMIZATION: Cache network timeout to avoid repeated storage reads
let cachedNetworkTimeout = null;
let timeoutCacheExpiry = 0;
const TIMEOUT_CACHE_TTL = 60000; // 1 minute

/**
 * Clears the cached timeout and auth header. Used by tests, and by the
 * service worker when credentials change (login / logout) so the old header
 * is not sent for up to a minute.
 */
export function clearApiCallCache() {
  cachedNetworkTimeout = null;
  timeoutCacheExpiry = 0;
  cachedAuthHeader = null;
  authCacheExpiry = 0;
}

// Forward declare cache variables for authentication
let cachedAuthHeader = null;
let authCacheExpiry = 0;

// ---------------------------------------------------------------------------------------------------
// https://dmitripavlutin.com/timeout-fetch-request/
/**
 * `fetch` with a timeout: the request is aborted after `options.timeout` ms
 * (default: the user's network timeout setting, cached for a minute). A caller-
 * supplied `signal` still works and aborts the request as well.
 * @param {string} resource - URL to fetch.
 * @param {RequestInit & {timeout?: number}} [options]
 * @returns {Promise<Response>}
 */
async function timeoutFetch(resource, options = {}) {
  // OPTIMIZATION: Use cached timeout if available and not expired
  const now = Date.now();
  if (cachedNetworkTimeout === null || now > timeoutCacheExpiry) {
    cachedNetworkTimeout = timeoutMilliseconds(
      await getOption('input_networkTimeout'),
    );
    timeoutCacheExpiry = now + TIMEOUT_CACHE_TTL;
  }

  const { timeout = cachedNetworkTimeout, signal: externalSignal } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  // If external signal provided, abort internal controller when external aborts
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    // Both must run even when fetch rejects: otherwise the timer stays armed
    // and the listener accumulates on a reused external signal.
    clearTimeout(id);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}
/**
 * Determines which server to call and which Authorization header to send.
 *
 * `data` is normally a query string. As an object it carries call options:
 * `host` overrides the stored server (the login flow talks to a server that is
 * not saved yet) and `loginflow` means "send no Authorization header".
 * @param {object|string} data
 * @returns {Promise<{server: string|undefined, authHeader: string|null}>}
 */
async function resolveServerAndAuth(data) {
  // Explicit host (login flow): use it instead of the stored server.
  if (typeof data === 'object' && 'host' in data) {
    let authHeader = null;
    if (!data.loginflow) authHeader = await authentication();
    return { server: data.host, authHeader };
  }
  // OPTIMIZATION: Fetch server and auth in parallel
  const needsAuth = !data.loginflow;
  const [server, authHeader] = await Promise.all([
    load_data('credentials', 'server'),
    needsAuth ? authentication() : Promise.resolve(null),
  ]);
  return { server, authHeader };
}

/**
 * Performs an API call to the specified endpoint with the given method and data.
 * @param {string} endpoint - The API endpoint to call.
 * @param {string} method - The HTTP method to use for the API call.
 * @param {object|string} data - The data to send with the API call.
 * @param {AbortSignal} signal - Optional abort signal for request cancellation.
 * @returns {Promise<object>} - A promise that resolves to the API response.
 */
export default async function apiCall(
  endpoint,
  method,
  data = '',
  signal = null,
) {
  let { server, authHeader } = await resolveServerAndAuth(data);

  // Nothing to call without a server, and (except during the login flow)
  // without usable credentials.
  if (!server || (!authHeader && !data?.loginflow)) {
    return { status: 'error', statusText: 'Not configured' };
  }

  // Add trailing slash to the server URL if not provided
  if (server && !server.endsWith('/')) {
    server += '/';
  }

  // Set the headers for the API call
  const headers = {
    Accept: 'application/json',
    'OCS-APIREQUEST': 'true',
    'User-Agent': 'Bookmarker4Nextcloud',
  };

  // Since v22 you must not send an Authorization header for loginflow
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  // Configure the fetch options
  const fetchInfo = {
    method,
    headers,
    credentials: 'omit',
  };

  // Add abort signal if provided
  if (signal) {
    fetchInfo.signal = signal;
  }

  // Construct the API call URL. The payload always travels in the query
  // string (a string `data` is the already-encoded query; an object carries
  // options, not payload), even for POST/PUT, which is what the Bookmarks API
  // accepts.
  const url = `${server}${endpoint}?${typeof data === 'string' ? data : ''}`;

  // Every failure resolves to { status: 'error', statusText }: callers such as
  // notifyUser() only test for 'error' and would report a failed save as done.
  try {
    const response = await timeoutFetch(url, fetchInfo);
    if (!response.ok) {
      return {
        status: 'error',
        // HTTP/2 responses carry no reason phrase
        statusText: response.statusText || `HTTP ${response.status}`,
      };
    }
    return await response.json();
  } catch (error) {
    // Map the low-level error to a message a user can act on: an abort here
    // is our own timeout; a SyntaxError means the body was not JSON (e.g. an
    // HTML login page from a wrong server URL).
    let statusText = error?.message || String(error);
    if (error?.name === 'AbortError') statusText = 'Timeout';
    else if (error instanceof SyntaxError) statusText = 'Invalid response';
    return { status: 'error', statusText };
  }
}

const AUTH_CACHE_TTL = 60000; // 1 minute

/**
 * Builds the HTTP Basic `Authorization` header from the stored login name and
 * app password (cached for a minute).
 *
 * @returns {Promise<string|null>} The header value, or null if the credentials
 *   are missing or incomplete.
 */
async function authentication() {
  // OPTIMIZATION: Use cached auth header if available and not expired
  const now = Date.now();
  if (cachedAuthHeader === null || now > authCacheExpiry) {
    // Load the credentials data from the database
    const data = await load_data('credentials', 'loginname', 'appPassword');

    // Incomplete credentials must not become "Basic base64('undefined:undefined')"
    // -- that header would be cached and sent (and counted by Nextcloud's
    // brute-force throttle) on every request.
    if (!data?.loginname || !data?.appPassword) return null;

    // Generate the authentication token using the loginname and appPassword
    cachedAuthHeader = `Basic ${toBase64(`${data.loginname}:${data.appPassword}`)}`;
    authCacheExpiry = now + AUTH_CACHE_TTL;
  }

  return cachedAuthHeader;
}

// btoa() throws on anything above Latin-1 (e.g. an umlaut in the login name);
// Nextcloud expects the credentials UTF-8 encoded.
/**
 * Base64-encodes a string as UTF-8.
 * @param {string} text
 * @returns {string}
 */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}
