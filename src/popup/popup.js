// @ts-check
import { createForm, hydrateForm } from './modules/hydrateForm.js';
import { load_data, getOption, getOptions } from '../lib/storage.js';
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
 * @returns {Promise<{apppwd: any, enableZen: any, server: string|undefined, needsReconnect: boolean, dataPromise: Promise<Object>|null}>}
 */
const sessionPromise = (async () => {
  // Fetch credential and zen mode in parallel (independent)
  const [apppwd, enableZen, server] = await Promise.all([
    load_data('credentials', 'appPassword'),
    getOption('cbx_enableZen'),
    load_data('credentials', 'server'),
  ]);

  const needsForm = apppwd !== undefined && !enableZen;
  let needsReconnect = false;
  let dataPromise = null;

  if (needsForm) {
    // Existing users lose their previously-granted broad host access on
    // update (S5 fix: host_permissions -> optional_host_permissions). Chrome
    // does not prompt for a permission *reduction*, so nothing re-grants
    // this automatically -- check before dispatching getData, which would
    // otherwise fail with no clear reason.
    let origin = null;
    try {
      origin = server ? new URL(server).origin : null;
    } catch (e) {
      origin = null;
    }
    const hasPermission = origin
      ? await chrome.permissions.contains({ origins: [`${origin}/*`] })
      : false;

    if (hasPermission) {
      prefetchFormOptions();
      dataPromise = getDataWithRetry();
    } else {
      needsReconnect = true;
    }
  }

  return { apppwd, enableZen, server, needsReconnect, dataPromise };
})();

/**
 * Warms the options cache with every key the render path reads.
 *
 * createForm, hydrateForm and fillFolders each read options *after* the data
 * arrives, serialising storage round trips behind the network round trip.
 * These reads depend on neither the DOM nor getData, so they can run inside
 * the window the round trip already occupies. getOption and getOptions share
 * one module-level Map (storage.js), so a single batched fetch here means the
 * later calls are cache hits.
 *
 * Fire-and-forget: a failure here just means the later read does its own work.
 * @returns {void}
 */
function prefetchFormOptions() {
  getOptions([
    'cbx_showUrl',
    'cbx_displayFolders',
    'cbx_showKeywords',
    'cbx_showDescription',
    'cbx_alreadyStored',
    'cbx_autoDescription',
    'folderIDs',
  ]).catch(() => {});
}

/** Resolves once the document has finished loading. */
const domReady =
  document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => {
        document.onreadystatechange = () => {
          if (document.readyState === 'complete') resolve();
        };
      });

/**
 * Runs the normal bookmark-form flow: create the form, wait for data, and
 * render either the error box or the hydrated form.
 *
 * Shared by the default boot path and the reconnect banner's success path so
 * the two don't duplicate (and drift from) the same handful of steps.
 *
 * @param {Promise<Object>} dataPromise - The in-flight (or about-to-start) getData result.
 * @returns {Promise<void>}
 */
async function runFormFlow(dataPromise) {
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

const boot = (async () => {
  const { apppwd, enableZen, server, needsReconnect, dataPromise } =
    await sessionPromise;
  await domReady;

  if (apppwd === undefined) {
    createAuthorizeButton();
  } else if (enableZen) {
    zenMode();
  } else if (needsReconnect) {
    createReconnectBanner(server);
  } else {
    await runFormFlow(dataPromise);
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
  // Dispatch first, read the retry count alongside it. Awaiting the option
  // before the first sendMessage would put a storage read in front of the
  // round trip this whole module is arranged to start as early as possible --
  // the count is not needed until the first attempt has already failed.
  let pending = chrome.runtime.sendMessage({ msg: 'getData' });
  // Mark it handled: if the option read below rejects first we never reach the
  // await, and an in-flight rejection would surface as an unhandled one. The
  // await still observes the real rejection.
  pending.catch(() => {});
  const maxRetries = await getOption('input_numberOfRetries');
  const retryCount = Number.isFinite(maxRetries) && maxRetries > 0 ? Math.round(maxRetries) : 5;

  let lastError = null;

  for (let attempt = 0; attempt < retryCount; attempt++) {
    // Exceptions from sendMessage propagate immediately (no retry on throws)
    const data = await (pending ?? chrome.runtime.sendMessage({ msg: 'getData' }));
    pending = null;

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

/**
 * Renders a "reconnect" prompt in place of the normal form when the stored
 * Nextcloud server's optional host permission is missing (S5 migration:
 * existing installs lose their previously-granted host_permissions on
 * update, and nothing re-grants that automatically).
 *
 * @param {string|undefined} server - The stored server URL, for display and for deriving the origin to request.
 * @returns {void}
 */
function createReconnectBanner(server) {
  const form = document.getElementById('bookmarkForm');
  form.setAttribute('class', 'flex flex-col justify-center items-center w-full gap-2');

  const msg = document.createElement('div');
  msg.textContent = `${chrome.i18n.getMessage('reconnectRequired')} ${server ?? ''}`;
  msg.className = 'text-center text-sm';

  const button = document.createElement('button');
  button.setAttribute('id', 'reconnect');
  button.textContent = chrome.i18n.getMessage('reconnectButton');
  button.setAttribute('class', 'btn btn-primary w-full');

  button.addEventListener('click', async () => {
    let origin;
    try {
      origin = new URL(server).origin;
    } catch (e) {
      msg.textContent = chrome.i18n.getMessage('reconnectDenied');
      return;
    }

    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      msg.textContent = chrome.i18n.getMessage('reconnectDenied');
      return;
    }

    prefetchFormOptions();
    await runFormFlow(getDataWithRetry());
  });

  form.replaceChildren(msg, button);
}
