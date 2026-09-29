// @ts-check
// -----------------------------------------------------------------------------
// Popup entry point.
//
// On open, the popup decides which of four screens to show:
//   1. no app password stored       -> "Authorize" button (login flow)
//   2. zen mode enabled             -> ask the service worker to save, close
//   3. host permission missing      -> "Reconnect" banner (asks for permission)
//   4. otherwise                    -> bookmark form filled with the page data
//
// Speed matters here: the slowest step is the getData round trip to the
// service worker, so it is started at module load (see session.js), in
// parallel with the DOM being built.
// -----------------------------------------------------------------------------
import { createForm, hydrateForm } from './modules/hydrateForm.js';
import addSaveBookmarkButtonListener from './modules/saveBookmarks.js';
import { getDataWithRetry } from './modules/dataRequest.js';
import { prefetchFormOptions, startSession } from './modules/session.js';
import {
  createAuthorizeButton,
  createErrorBox,
  createReconnectBanner,
} from './modules/screens.js';

// Started here, at module load, so the getData round trip does not wait for
// the DOM (see startSession).
const sessionPromise = startSession();

/** Resolves once the document has finished loading. */
const domReady =
  document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => {
        document.addEventListener('readystatechange', () => {
          if (document.readyState === 'complete') resolve();
        });
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
    // Fitting is cosmetic: the box stays readable if the import fails.
    try {
      const { default: textFit } = await import('textfit');
      textFit(document.getElementById('errormessage'));
    } catch (error) {
      console.error('[popup] textfit failed:', error);
    }
    return;
  }

  try {
    await hydrateForm(data);
  } catch (error) {
    console.error('[popup] hydrating the form failed:', error);
    createErrorBox({ error: error?.message });
    return;
  }
  addSaveBookmarkButtonListener(data.bookmarked);
}

/**
 * Zen mode: hand the whole job to the service worker and close the popup
 * immediately; the result is reported through a notification.
 */
function zenMode() {
  chrome.runtime.sendMessage({ msg: 'zenMode' });
  window.close();
}

// Not top-level awaited: awaiting here would make `await import('popup.js')`
// (used throughout tests/popup.test.js) block until the whole bootstrap
// chain -- including the getData network round trip -- settles, instead of
// returning once the module body finishes executing as the tests expect.
const boot = (async () => {
  const { apppwd, enableZen, server, needsReconnect, dataPromise } =
    await sessionPromise;
  await domReady;

  if (apppwd === undefined) {
    // Screen 1: not logged in yet.
    createAuthorizeButton();
  } else if (enableZen) {
    // Screen 2: zen mode.
    zenMode();
  } else if (needsReconnect) {
    // Screen 3: once the permission is granted the banner runs the form flow
    // itself; no data request was started before, so start one now.
    createReconnectBanner(server, () => {
      prefetchFormOptions();
      return runFormFlow(getDataWithRetry());
    });
  } else {
    // Screen 4: the normal case; the request is already in flight.
    await runFormFlow(dataPromise);
  }
})();

// Nothing awaits the bootstrap, so report failures rather than leaving an
// empty popup with a spinner that never stops.
boot.catch((error) => {
  console.error('[popup] initialisation failed:', error);
  try {
    createErrorBox({ error: error?.message });
  } catch (renderError) {
    console.error('[popup] could not show the error:', renderError);
  }
});
