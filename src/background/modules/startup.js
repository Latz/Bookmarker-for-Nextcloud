// @ts-check
import apiCall from '../../lib/apiCall.js';
import {
  getOption,
  load_data,
  store_data,
  ensureDefaults,
} from '../../lib/storage.js';
import { initializeErrorIconCache } from './browser/notification.js';
import getBrowserTheme from './browser/getBrowserTheme.js';
import { createContextMenus } from './browser/contextMenu.js';

/**
 * Sets the toolbar icon to match the browser theme.
 *
 * Only 16/32/64/128 are supplied: Chrome renders the action icon at 16px
 * (32px at 2x DPR) and downsamples whatever it is given, so handing it the
 * 512x512 asset meant decoding 50 KB on every worker start for a 16px slot --
 * slower and blurrier than providing the intended size.
 *
 * Falls back to the manifest default (light) if theme detection fails.
 * @returns {Promise<void>}
 */
async function applyThemedIcon() {
  try {
    const browserTheme = await getBrowserTheme();
    await chrome.action.setIcon({
      path: {
        16: `/images/icon-16x16-${browserTheme}.png`,
        32: `/images/icon-32x32-${browserTheme}.png`,
        64: `/images/icon-64x64-${browserTheme}.png`,
        128: `/images/icon-128x128-${browserTheme}.png`,
      },
    });
  } catch (error) {
    console.error('Failed to detect browser theme, using default:', error);
  }
}

// The worker restarts after every ~30 s idle, and every start used to send a
// request. Idle connections stay usable for a few minutes, so a warm-up more
// often than this warms nothing that is not warm already.
const WARMUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
const WARMUP_STAMP_KEY = 'lastConnectionWarmup';

/**
 * Whether a warm-up ran less than WARMUP_MIN_INTERVAL_MS ago; if not, records
 * this one. The stamp is kept in the 'misc' store of the extension's own
 * database: module state does not survive a worker restart, and
 * chrome.storage.session would need the "storage" permission the manifest does
 * not declare. If the store cannot be read or written it answers "no", i.e.
 * warms up every time.
 * @returns {Promise<boolean>}
 */
async function warmedUpRecently() {
  try {
    const last = (await load_data('misc', WARMUP_STAMP_KEY)) ?? 0;
    if (Date.now() - last < WARMUP_MIN_INTERVAL_MS) return true;
    await store_data('misc', { [WARMUP_STAMP_KEY]: Date.now() });
  } catch {
    // stamp unavailable: just warm up
  }
  return false;
}

/**
 * Warms up the connection to the Nextcloud server on SW startup (at most once
 * per WARMUP_MIN_INTERVAL_MS).
 * Primes the TCP/TLS connection, auth header cache, and network timeout cache.
 * Fire-and-forget — errors are silently ignored.
 */
async function warmupConnection() {
  // `load_data` unwraps single-item reads (storage.js), so this resolves to the
  // server URL string itself — not an object with a `server` property.
  const server = await load_data('credentials', 'server');
  if (!server) return;
  if (await warmedUpRecently()) return;

  // The cheapest useful request: one bookmark of the first page. The response
  // is discarded; the request only exists for its side effects on the caches.
  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const data = new URLSearchParams({ page: 0, limit: 1 }).toString();
  await apiCall(endpoint, 'GET', data);
}

/**
 * Initializes the extension on service worker start: warm-up, themed icon,
 * error-icon cache and the context menu.
 * @returns {Promise<void>}
 */
export async function init() {
  // Kick the connection warm-up off first. It is fire-and-forget, and
  // everything below is local work that would otherwise delay the very thing
  // this call exists to do early.
  warmupConnection().catch(() => {});

  // Options introduced after the user installed are absent from their database.
  // Not awaited: nothing below depends on it, and a failure only means the
  // defaults are retried at the next start.
  ensureDefaults().catch((error) => {
    console.error('[startup] could not add missing default options:', error);
  });

  // These three are mutually independent -- running them in sequence just made
  // the worker slower to reach the point where it can answer a getData
  // message, on every cold start.
  // allSettled: one failing (e.g. an IndexedDB error in getOption) must not
  // keep the context menu from being created.
  const [, iconCache, zenModeEnabled] = await Promise.allSettled([
    applyThemedIcon(),
    initializeErrorIconCache(),
    getOption('cbx_enableZen'),
  ]);
  // The first result (icon) already logs its own failure inside
  // applyThemedIcon, so only the other two are checked here.
  for (const result of [iconCache, zenModeEnabled]) {
    if (result.status === 'rejected') {
      console.error('[startup] init step failed:', result.reason);
    }
  }

  // The zen entry is only offered if the option is on; if reading it failed,
  // fall back to the regular menu without it.
  await createContextMenus(
    zenModeEnabled.status === 'fulfilled' ? zenModeEnabled.value : false,
  );
}
