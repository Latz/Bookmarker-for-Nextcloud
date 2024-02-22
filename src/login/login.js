// https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/index.html

import apiCall from '../lib/apiCall.js';
import { store_data } from '../lib/storage.js';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    document.getElementById('msg').innerText = '';

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
  document.getElementById('error').innerHTML = '';
  document.getElementById('msg').innerHTML = '';

  const testServer = document.getElementById('testServer');
  testServer.innerHTML = 'Loading...';
  const host = document.getElementById('serverName').value;

  const endpoint = 'index.php/login/v2';
  const method = 'POST';

  const response = await apiCall(endpoint, method, {
    host,
    loginflow: true,
  });

  response.login ? loginPoll(response) : serverError(response);
}

async function loginPoll(request) {
  let authorized = false;
  let authCheck;

  chrome.tabs.create({ url: request.login });
  while (!authorized) {
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
      // suppress console.log
    }
    // put a little pause between requests
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000);
    });
  }
  let response = await authCheck.json();
  store_data('credentials', {
    appPassword: response.appPassword,
    loginname: response.loginName,
    server: response.server,
  });
}

function serverError(response) {
  // display error message
  const msg = document.getElementById('msg');
  const errorDiv = document.getElementById('error');
  const description = document.getElementById('description');
  const testServer = document.getElementById('testServer');

  fetch(chrome.runtime.getURL('/lib/status-codes.json'))
    .then((data) => data.json())
    .then((codes) => {
      errorDiv.innerText = 'Error!';
      if (response.status > 0) {
        msg.innerText = `${response.status} - ${
          codes[response.status].message
        }`;
        description.innerText = `(${codes[response.status].description})`;
      } else if (response.statusText) {
        msg.innerText = ` ${response.statusText}`;
      }
      testServer.innerHTML = 'Open login page';
      document.getElementById('serverName').focus();
    });
}
