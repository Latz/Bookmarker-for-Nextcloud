// @ts-check
import { createForm, hydrateForm } from './modules/hydrateForm.js';
import { load_data, getOption } from '../lib/storage.js';
import addSaveBookmarkButtonListener from './modules/saveBookmarks.js';

/**
 * Reads the credential/zen state and, when the bookmark form is the path we
 * will take, starts the service-worker round trip straight away.
 *
 * This runs at module load rather than on DOM ready: none of it touches the
 * DOM, and the getData round trip (script injection, HTML parsing, a network
 * call to Nextcloud) is the slowest step in opening the popup. Waiting for
 * readyState === 'complete' queued it behind the stylesheet for no reason.
 *
 * getData is deliberately *not* dispatched on the other two paths -- it
 * injects a script into the active tab, which is wasted work and needless page
 * access when we are only going to show the authorize button or fire zen mode.
 *
 * @returns {Promise<{apppwd: any, enableZen: any, dataPromise: Promise<Object>|null}>}
 */
const sessionPromise = (async () => {
  // Fetch credential and zen mode in parallel (independent)
  const [apppwd, enableZen] = await Promise.all([
    load_data('credentials', 'appPassword'),
    getOption('cbx_enableZen'),
  ]);

  const needsForm = apppwd !== undefined && !enableZen;
  return {
    apppwd,
    enableZen,
    dataPromise: needsForm ? getDataWithRetry() : null,
  };
})();

/** Resolves once the document has finished loading. */
const domReady =
  document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => {
        document.onreadystatechange = () => {
          if (document.readyState === 'complete') resolve();
        };
      });

const boot = (async () => {
  const { apppwd, enableZen, dataPromise } = await sessionPromise;
  await domReady;

  if (apppwd === undefined) {
    createAuthorizeButton();
  } else if (enableZen) {
    zenMode();
  } else {
    // createForm is async; await it so hydrateForm cannot race the elements
    // it builds. The data round trip is already in flight either way.
    const [data] = await Promise.all([dataPromise, createForm()]);
    if (!data.ok) {
      createErrorBox(data);
      // Only needed on the error path, so keep it out of the default bundle.
      const { default: textFit } = await import('textfit');
      textFit(document.getElementById('errormessage'));
    } else {
      hydrateForm(data);
      addSaveBookmarkButtonListener(data.bookmarked);
    }
  }
})();

// Nothing awaits the bootstrap, so report failures rather than letting them
// become silent unhandled rejections. (Previously these propagated out of the
// readystatechange handler, where they were equally invisible.)
boot.catch((error) => {
  console.error('[popup] initialisation failed:', error);
});

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

    // Some failures can never succeed on a retry -- a chrome:// or otherwise
    // restricted page is not going to become bookmarkable. Retrying those just
    // re-ran the whole pipeline five times and delayed the error by ~2.5s.
    if (data.retryable === false) {
      return data;
    }

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
  const parent = document.createElement('div');
  parent.className = 'parent w-full justify-items-center items-center border border-sky-500';

  const iconDiv = document.createElement('div');
  iconDiv.className = 'div1';
  const img = document.createElement('img');
  img.src = '../images/icon-64x64-light.png';
  img.height = 64;
  img.width = 64;
  img.alt = '';
  iconDiv.appendChild(img);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'div2 text-left text-3xl font-bold text-sky-500 underline';
  labelDiv.textContent = `${chrome.i18n.getMessage('error')}:`;

  const msgDiv = document.createElement('div');
  msgDiv.id = 'errormessage';
  msgDiv.className = 'div3 text-clip';
  msgDiv.textContent = data.error;

  parent.append(iconDiv, labelDiv, msgDiv);
  document.body.replaceChildren(parent);
}
// --------------------------------------------------------------------------------------------------
function createAuthorizeButton() {
  const form = document.getElementById('bookmarkForm');
  form.setAttribute('class', 'flex justify-center w-full');
  const button = document.createElement('button');
  button.setAttribute('id', 'authorize');
  button.setAttribute('aria-label', chrome.i18n.getMessage('authorizeExtension'));

  button.textContent = chrome.i18n.getMessage('authorizeExtension');
  button.setAttribute('class', 'btn btn-primary w-full');
  form.replaceChildren(button);
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ msg: 'authorize' });
    window.close();
  });
}

function zenMode() {
  chrome.runtime.sendMessage({ msg: 'zenMode' });
  window.close();
}
