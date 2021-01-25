import { load_data, store_data } from '../lib/storage.js';
import apiCall from '../lib/apiCall.js';
var options = {};

// loader markup
const loaderMarkup = `<div><span></span><span></span><span></span><span></span>
                      <span></span><span></span><span></span></div>`;

// form elements
var ncHost, host_msg, btn_checkHost, btn_saveHost, input_host, close_button;

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    document.getElementById('btn_checkHost').addEventListener('click', async (e) => {
      e.preventDefault();
      let host = document.getElementById('host').value;
      let response = await checkHost(host);
      if (!response.login) {
        document.getElementById('host_msg').innerHTML = `${response.status} - ${response.statusText}`;
      } else {
        // let the polling run in the background and close the popup
        browser.runtime.sendMessage({
          msg: 'poll',
          host,
          login: response.login,
          endpoint: response.poll.endpoint,
          token: response.poll.token,
        });
        // TODO: Supress error that connection has been lost
        window.close();
      }
    });
  }
};
// -----------------------------------------------------------------------------------------
async function checkHost(host) {
  const host_msg = document.getElementById('host_msg');
  host_msg.classList.add('loading');
  host_msg.innerHTML = loaderMarkup;

  // clear host host_msg
  const endpoint = 'index.php/login/v2';
  const method = 'POST';
  const response = await apiCall(endpoint, method, { host });
  host_msg.classList.remove('loader-wave');
  return response;
}
// ---------------------------------------------------------------------------------------------------------
async function saveHost() {
  const nchost = document.getElementById('ncHost').value;

  let x = await store_data('credentials', { nchost });
  let result = await load_data('credentials', nchost);

  const btn_saveHost = document.getElementById('btn_saveHost');
  btn_saveHost.classList.add('checkOK');
  toggleDiv(document.getElementById('credentials'));
  btn_saveCredentials.disabled = true;
  document.getElementById('username').focus();
}
// ---------------------------------------------------------------------------------------------------------
