// https://docs.nextcloud.com/server/latest/developer_manual/client_apis/LoginFlow/index.html

import apiCall from '../lib/apiCall.js';
import { store_data } from '../lib/storage.js';
import { getReasonPhrase } from 'http-status-codes';
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
    document.getElementById('testServer').innerHTML = 'Open login page';
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

  errorDiv.innerText = 'Error!';

  if (response.status > 0) {
    msg.innerText = `${response.status}  - ${getReasonPhrase(response.status)}`;
  } else if (response.statusText) {
    msg.innerText = ` ${response.statusText}`;
  }
  testServer.innerHTML = 'Open login page';
  document.getElementById('serverName').focus();
}
