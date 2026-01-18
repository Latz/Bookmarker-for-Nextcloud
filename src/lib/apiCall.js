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
  // OPTIMIZATION: Parallel fetch of server and auth (if needed)
  let server = '';
  let authHeader = null;

  if (typeof data === 'object' && 'host' in data) {
    server = data.host;
    // For loginflow, don't fetch auth
    if (!data.loginflow) {
      authHeader = await authentication();
    }
  } else {
    // OPTIMIZATION: Fetch server and auth in parallel
    const needsAuth = !data.loginflow;
    [server, authHeader] = await Promise.all([
      load_data('credentials', 'server'),
      needsAuth ? authentication() : Promise.resolve(null),
    ]);
  }

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
    // NOTE: This duplicate declaration creates variable shadowing - it's a bug but kept for backward compatibility
    // The inner result is used for successful/error responses, outer result is used for catch block
    let result = {};
    // Perform the API call and handle the response
    const response = await timeoutFetch(url, fetchInfo);
    if (response.ok) {
      result = await response.json();
    } else {
      result = {
        status: response.status,
        statusText: response.statusText,
      };
      throw new Error(result.statusText);
    }
    // OPTIMIZATION: Removed unnecessary Promise.resolve
    return result;
  } catch (error) {
    // Only handle TypeError (network errors), other errors return {} (outer result)
    if (error instanceof TypeError) {
      result = {
        status: -1,
        statusText: error.message,
      };
    }
  }

  // OPTIMIZATION: Removed unnecessary Promise.resolve
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
