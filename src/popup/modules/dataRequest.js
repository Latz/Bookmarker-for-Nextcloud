// @ts-check
import { getOption } from '../../lib/storage.js';
import { showRetryMessage } from './screens.js';

/**
 * The two requests the popup makes when it opens. They are sent together and
 * answered independently, so the form can be filled with the page data without
 * waiting for the server round trip of the "already bookmarked?" lookup.
 */
export const PAGE_DATA_REQUEST = { msg: 'getData', data: { deferCheck: true } };
export const BOOKMARK_STATUS_REQUEST = { msg: 'getBookmarkStatus' };

/**
 * Sends one request to the service worker. Never rejects: a throw (e.g. the
 * worker is still waking up: "Receiving end does not exist") or a missing/
 * malformed reply becomes a retryable error result, so the retry loop treats
 * it like any other failed attempt.
 * @param {{msg: string, data?: Object}} request
 * @returns {Promise<Object>} The background's reply or a retryable error object
 */
async function requestData(request) {
  const fallback = () => chrome.i18n.getMessage('ConnectionError') || 'Error';
  try {
    const data = await chrome.runtime.sendMessage(request);
    if (data && typeof data === 'object') return data;
    return { ok: false, retryable: true, error: fallback() };
  } catch (error) {
    return { ok: false, retryable: true, error: error?.message || fallback() };
  }
}

/**
 * Gets data from the background with retry logic
 * Retries the connection when it fails, up to the configured number of retries
 * @param {{msg: string, data?: Object}} [request] - What to ask for: the
 *   complete data (default), or one of the two popup requests above.
 * @returns {Promise<Object>} The data from the background or error object
 */
export async function getDataWithRetry(request = { msg: 'getData' }) {
  // Dispatch first, read the retry count alongside it. Awaiting the option
  // before the first sendMessage would put a storage read in front of the
  // round trip this whole module is arranged to start as early as possible --
  // the count is not needed until the first attempt has already failed.
  // requestData never rejects, so an in-flight failure cannot surface as an
  // unhandled rejection while the option read below is still pending.
  let pending = requestData(request);
  let maxRetries;
  try {
    maxRetries = await getOption('input_numberOfRetries');
  } catch (error) {
    // Fall back to the default count rather than failing the whole flow
    console.error('[popup] reading the retry count failed:', error);
  }
  // Use the configured count if it is a positive number, otherwise default to 5.
  const retryCount =
    Number.isFinite(maxRetries) && maxRetries > 0 ? Math.round(maxRetries) : 5;

  // The last failed reply, returned if every attempt fails. The first
  // iteration awaits the request dispatched above instead of sending another.
  let lastError = null;

  for (let attempt = 0; attempt < retryCount; attempt++) {
    const data = await (pending ?? requestData(request));
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
      // NOSONAR: retries are sequential by design
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // All retries failed, return the last error
  return lastError;
}
