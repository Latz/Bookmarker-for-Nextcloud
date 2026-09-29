// @ts-check
import { load_data, getOption, getOptions } from '../../lib/storage.js';
import {
  getDataWithRetry,
  PAGE_DATA_REQUEST,
  BOOKMARK_STATUS_REQUEST,
} from './dataRequest.js';
import { preloadKeywordAssets } from './fillKeywords.js';

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
export function prefetchFormOptions() {
  getOptions([
    'cbx_showUrl',
    'cbx_displayFolders',
    'cbx_showKeywords',
    'cbx_showDescription',
    'cbx_alreadyStored',
    'cbx_autoDescription',
    'folderIDs',
    'input_numberOfRetries',
  ])
    .then((options) => {
      // Tagify and the keyword whitelist are also independent of getData
      if (options.cbx_showKeywords) preloadKeywordAssets();
    })
    .catch(() => {});
}

/**
 * Reads the credential/zen state and, when the bookmark form is the path we
 * will take, starts the service-worker round trip straight away.
 *
 * Call this at module load rather than on DOM ready: none of it touches the
 * DOM, and the getData round trip (script injection, HTML parsing, a network
 * call to Nextcloud) is the slowest step in opening the popup. Waiting for
 * readyState === 'complete' queued it behind the stylesheet for no reason.
 *
 * getData is deliberately *not* dispatched on the other two paths -- it
 * injects a script into the active tab, which is wasted work and needless page
 * access when we are only going to show the authorize button or fire zen mode.
 *
 * The page data and the "already bookmarked?" lookup are requested separately
 * (dataPromise / statusPromise): the lookup is a server round trip, and the
 * form can be filled without it.
 *
 * @returns {Promise<{apppwd: any, enableZen: any, server: string|undefined, needsReconnect: boolean, dataPromise: Promise<Object>|null, statusPromise: Promise<Object>|null}>}
 */
export async function startSession() {
  // Fetch credential and zen mode in parallel (independent)
  const [apppwd, enableZen, server] = await Promise.all([
    load_data('credentials', 'appPassword'),
    getOption('cbx_enableZen'),
    load_data('credentials', 'server'),
  ]);

  // Three possible paths for the popup:
  //  1. not logged in (no app password)  -> show the authorize button
  //  2. zen mode enabled                 -> save immediately, no form
  //  3. otherwise                        -> show the bookmark form (needsForm)
  const needsForm = apppwd !== undefined && !enableZen;
  let needsReconnect = false;
  let dataPromise = null;
  let statusPromise = null;

  if (needsForm) {
    // Existing users lose their previously-granted broad host access on
    // update (S5 fix: host_permissions -> optional_host_permissions). Chrome
    // does not prompt for a permission *reduction*, so nothing re-grants
    // this automatically -- check before dispatching getData, which would
    // otherwise fail with no clear reason.
    let origin;
    try {
      origin = server ? new URL(server).origin : null;
    } catch {
      origin = null;
    }
    // The prefetch only reads options, so it can overlap the permission check
    // instead of waiting behind it.
    prefetchFormOptions();
    const hasPermission = origin
      ? await chrome.permissions.contains({ origins: [`${origin}/*`] })
      : false;

    if (hasPermission) {
      dataPromise = getDataWithRetry(PAGE_DATA_REQUEST);
      statusPromise = getDataWithRetry(BOOKMARK_STATUS_REQUEST);
    } else {
      needsReconnect = true;
    }
  }

  return {
    apppwd,
    enableZen,
    server,
    needsReconnect,
    dataPromise,
    statusPromise,
  };
}
