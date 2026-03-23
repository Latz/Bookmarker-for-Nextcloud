import { createForm, hydrateForm } from './modules/hydrateForm.js';
import { load_data, getOption } from '../lib/storage.js';
import addSaveBookmarkButtonListener from './modules/saveBookmarks.js';
import textFit from 'textfit';

// Check if the user credentials are
document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    // Fetch credential and zen mode in parallel (independent)
    const [apppwd, enableZen] = await Promise.all([
      load_data('credentials', 'appPassword'),
      getOption('cbx_enableZen'),
    ]);

    if (apppwd === undefined) {
      createAuthorizeButton();
    } else if (enableZen) {
      zenMode();
    } else {
      createForm();
      const data = await getDataWithRetry();
      if (!data.ok) {
        createErrorBox(data);
        textFit(document.getElementById('errormessage'));
      } else {
        hydrateForm(data);
        addSaveBookmarkButtonListener(data.bookmarked);
      }
    }
  }
};

// --------------------------------------------------------------------------------------------------
/**
 * Gets data from the background with retry logic
 * Retries the connection when it fails, up to the configured number of retries
 * @returns {Promise<Object>} The data from the background or error object
 */
async function getDataWithRetry() {
  const maxRetries = await getOption('input_numberOfRetries');
  const retryCount = Number.isFinite(maxRetries) && maxRetries > 0 ? Math.round(maxRetries) : 5;

  let lastError = null;

  for (let attempt = 0; attempt < retryCount; attempt++) {
    // Exceptions from sendMessage propagate immediately (no retry on throws)
    const data = await chrome.runtime.sendMessage({ msg: 'getData' });

    // If the data is ok, return it immediately
    if (data.ok) {
      return data;
    }

    // If data is not ok but we have more retries, wait and try again
    lastError = data;

    if (attempt < retryCount - 1) {
      // Show retry message starting from the second retry (attempt 1)
      if (attempt >= 1) {
        showRetryMessage(attempt + 1, retryCount);
      }
      // Wait 500ms before retrying (exponential backoff could be added)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // All retries failed, return the last error
  return lastError;
}

/**
 * Shows a retry message in the popup
 * @param {number} currentRetry - The current retry number (1-indexed)
 * @param {number} maxRetries - The maximum number of retries
 */
function showRetryMessage(currentRetry, maxRetries) {
  const baseMessage = chrome.i18n.getMessage('retryingConnection');
  const message = `${baseMessage} (${currentRetry}/${maxRetries})`;
  const retryDiv = document.createElement('div');
  retryDiv.id = 'retryMessage';
  retryDiv.className = 'text-center text-sm text-yellow-600 mt-2';
  retryDiv.textContent = message;

  // Remove any existing retry message
  const existingMessage = document.getElementById('retryMessage');
  if (existingMessage) {
    existingMessage.remove();
  }

  // Add the retry message to the form
  const form = document.getElementById('bookmarkForm');
  if (form) {
    form.appendChild(retryDiv);
  }
}
// --------------------------------------------------------------------------------------------------
function createErrorBox(data) {
  document.body.innerHTML = `
    <div class="parent w-full justify-items-center items-center border border-sky-500">
      <div class="div1"><img src="../images/icon-64x64-light.png" height="64" width="64" alt=""></div>
      <div class="div2 text-left text-3xl font-bold text-sky-500 underline">${chrome.i18n.getMessage(
        'error',
      )}:</div>
      <div id="errormessage" class="div3 text-clip" >${data.error}</div>
    </div>`;
}
// --------------------------------------------------------------------------------------------------
function createAuthorizeButton() {
  const form = document.getElementById('bookmarkForm');
  form.setAttribute('class', 'flex justify-center w-full');
  const button = document.createElement('button');
  button.setAttribute('id', 'authorize');
  button.setAttribute('aria-label', chrome.i18n.getMessage('authorizeExtension'));

  button.innerHTML = chrome.i18n.getMessage('authorizeExtension');
  document.getElementById('bookmarkForm').innerHTML = '';
  document.getElementById('bookmarkForm').appendChild(button);
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
