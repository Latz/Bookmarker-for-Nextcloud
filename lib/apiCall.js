import { load_data } from './storage.js';

export default async function apiCall(endpoint, method, data = '') {
  let server = '';
  if (typeof data === 'object' && 'host' in data) {
    server = data.host;
  } else {
    server = await load_data('credentials', 'server');
  }

  // add trailing slash if not provided
  if (!server.slice(-1) !== '/') server += '/';

  const headers = {
    'OCS-APIREQUEST': 'true',
    'User-Agent': 'Bookmarker4Nextcloud',
    Authorization: await authentication(),
  };

  let fetchInfo = {
    method,
    headers,
    credentials: 'omit',
    Accept: 'application/json',
  };

  var url = `${server}${endpoint}?${data}`;

  let result = {};
  try {
    let response = await fetch(url, fetchInfo);
    result = response.ok
      ? (result = await response.json())
      : { ok: response.ok, status: response.status, statusText: response.statusText };
  } catch (error) {
    result = { ok: false, status: 404, statusText: error.message };
  }

  return new Promise((resolve) => resolve(result));
}
// -----------------------------------------------------------------------------------------------------
async function authentication() {
  let data = await load_data('credentials', 'loginname', 'appPassword');
  return 'Basic ' + btoa(data.loginname + ':' + data.appPassword);
}
