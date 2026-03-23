import { getOption, load_data } from './storage.js';

// OPTIMIZATION: Cache network timeout to avoid repeated storage reads
let cachedNetworkTimeout = null;
let timeoutCacheExpiry = 0;
const TIMEOUT_CACHE_TTL = 60000; // 1 minute

// Export function to clear caches (for testing)
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
async function timeoutFetch(resource, options = {}) {
  // OPTIMIZATION: Use cached timeout if available and not expired
  const now = Date.now();
  if (cachedNetworkTimeout === null || now > timeoutCacheExpiry) {
    cachedNetworkTimeout = (await getOption('input_networkTimeout')) * 1000;
    timeoutCacheExpiry = now + TIMEOUT_CACHE_TTL;
  }

  let networkTimeout = cachedNetworkTimeout;

  // default networkTimeout to 10 seconds if not set
  if (isNaN(networkTimeout) || networkTimeout === 0) {
    networkTimeout = 10000;
  }

  const { timeout = networkTimeout, signal: externalSignal } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  // If external signal provided, abort internal controller when external aborts
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort());
  }

  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(id);
  return response;
}
async function resolveServerAndAuth(data) {
  if (typeof data === 'object' && 'host' in data) {
    const authHeader = data.loginflow ? null : await authentication();
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

  // Add trailing slash to the server URL if not provided
  if (server && !server.endsWith('/')) {
    server += '/';
  }

  // Set the headers for the API call
  const headers = {
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
    Accept: 'application/json',
  };

  // Add abort signal if provided
  if (signal) {
    fetchInfo.signal = signal;
  }

  // Construct the API call URL
  const url = `${server}${endpoint}?${data}`;

  let result = {};
  try {
    const response = await timeoutFetch(url, fetchInfo);
    if (response.ok) {
      result = await response.json();
    } else {
      result = {
        status: 'error',
        statusText: response.statusText,
      };
      throw new Error(result.statusText);
    }
    return result;
  } catch (error) {
    if (error instanceof TypeError) {
      result = {
        status: -1,
        statusText: error.message,
      };
    }
  }

  return result;
}

const AUTH_CACHE_TTL = 60000; // 1 minute

/**
 * Generates an authentication token for the API.
 *
 * @returns {string} The generated authentication token.
 */
async function authentication() {
  // OPTIMIZATION: Use cached auth header if available and not expired
  const now = Date.now();
  if (cachedAuthHeader === null || now > authCacheExpiry) {
    // Load the credentials data from the database
    const data = await load_data('credentials', 'loginname', 'appPassword');

    // Generate the authentication token using the loginname and appPassword
    // OPTIMIZATION: Removed unnecessary Promise.resolve
    cachedAuthHeader = 'Basic ' + btoa(data.loginname + ':' + data.appPassword);
    authCacheExpiry = now + AUTH_CACHE_TTL;
  }

  return cachedAuthHeader;
}
