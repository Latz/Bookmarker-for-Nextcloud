import { getOption, load_data } from './storage.js';

// ---------------------------------------------------------------------------------------------------
// https://dmitripavlutin.com/timeout-fetch-request/
async function timeoutFetch(resource, options = {}) {
  let networkTimeout = (await getOption('input_networkTimeout')) * 1000;

  // default networkTimeout to 10 seconds if not set
  if (isNaN(networkTimeout || networkTimeout < 10)) {
    networkTimeout = 10000;
  }

  const { timeout = networkTimeout } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

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
 * @returns {Promise<object>} - A promise that resolves to the API response.
 */
export default async function apiCall(endpoint, method, data = '') {
  // Determine the server to send the API call to
  let server = '';
  if (typeof data === 'object' && 'host' in data) {
    server = data.host;
  } else {
    server = await load_data('credentials', 'server');
  }

  // Add trailing slash to the server URL if not provided
  if (server && !server.endsWith('/')) {
    server += '/';
  }

  // Set the headers for the API call
  const headers = {
    'OCS-APIREQUEST': 'true',
    'User-Agent': 'Bookmarker4Nextcloud',
    // Authorization: await authentication(),
  };

  // Since v22 you must not send an Authorization header
  if (!data.loginflow) {
    headers['Authorization'] = await authentication();
  }

  // Configure the fetch options
  const fetchInfo = {
    method,
    headers,
    credentials: 'omit',
    Accept: 'application/json',
  };

  // Construct the API call URL
  const url = `${server}${endpoint}?${data}`;

  let result = {};
  try {
    let result = {};
    // Perform the API call and handle the response
    let response = await timeoutFetch(url, fetchInfo);
    if (response.ok) {
      result = await response.json();
    } else {
      result = {
        status: response.status,
        statusText: response.statusText,
      };
      throw new Error(result.statusText);
    }
    return Promise.resolve(result);
  } catch (error) {
    if (error instanceof TypeError) {
      result = {
        status: -1,
        statusText: error.message,
      };
    }
  }

  return Promise.resolve(result);
}

/**
 * Generates an authentication token for the API.
 *
 * @returns {string} The generated authentication token.
 */
async function authentication() {
  // Load the credentials data from the database
  let data = await load_data('credentials', 'loginname', 'appPassword');

  // Generate the authentication token using the loginname and appPassword
  return Promise.resolve(
    'Basic ' + btoa(data.loginname + ':' + data.appPassword)
  );
}
