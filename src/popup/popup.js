import { createForm, hydrateForm } from './modules/hydrateForm.js';
import { load_data, getOption } from '../lib/storage.js';
import addSaveBookmarkButtonListener from './modules/saveBookmarks.js';
import textFit from 'textfit';

// Check if the user credentials are
document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    const apppwd = await load_data('credentials', 'appPassword');

    if ((await load_data('credentials', 'appPassword')) === undefined) {
      createAuthorizeButton();
    } else {
      if (await getOption('cbx_enableZen')) {
        zenMode();
      } else {
        createForm();
        const data = await chrome.runtime.sendMessage({ msg: 'getData' });
        if (!data.ok) {
          createErrorBox(data);
          textFit(document.getElementById('errormessage'));
        } else {
          hydrateForm(data);
          addSaveBookmarkButtonListener(data.bookmarked);
        }
      }
    }
  }
};
// --------------------------------------------------------------------------------------------------
function createErrorBox(data) {
  document.body.innerHTML = `
    <div class="parent w-full justify-items-center items-center border border-sky-500">
      <div class="div1"><img src="../images/icon-64x64-light.png" height="64px" width="64px"></div>
      <div class="div2 text-left text-3xl font-bold text-sky-500 underline">${chrome.i18n.getMessage(
        'error',
      )}:</div>
      <div id="errormessage" class="div3 text-clip" >${data.error}</div>
    </div>`;
}
// --------------------------------------------------------------------------------------------------
function createAuthorizeButton() {
  const form = document.getElementById('form');
  form.setAttribute('class', 'flex justify-center w-full');
  const button = document.createElement('button');
  button.setAttribute('id', 'authorize');

  button.innerHTML = chrome.i18n.getMessage('authorizeExtension');
  document.getElementById('form').innerHTML = '';
  document.getElementById('form').appendChild(button);
  button.setAttribute('class', 'btn btn-primary w-full');
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ msg: 'authorize' });
    window.close();
  });
}

function zenMode() {
  window.close();
  chrome.runtime.sendMessage({ msg: 'zenMode' });
}
