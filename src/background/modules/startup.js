// @ts-check
import apiCall from '../../lib/apiCall.js';
import { getOption, load_data } from '../../lib/storage.js';
import { initializeErrorIconCache } from './notification.js';
import getBrowserTheme from './getBrowserTheme.js';
import { createContextMenus } from './contextMenu.js';

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

/**
 * Warms up the connection to the Nextcloud server on SW startup.
 * Primes the TCP/TLS connection, auth header cache, and network timeout cache.
 * Fire-and-forget — errors are silently ignored.
 */
async function warmupConnection() {
  // `load_data` unwraps single-item reads (storage.js), so this resolves to the
  // server URL string itself — not an object with a `server` property.
  const server = await load_data('credentials', 'server');
  if (!server) return;

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

  // These three are mutually independent -- running them in sequence just made
  // the worker slower to reach the point where it can answer a getData
  // message, on every cold start.
  const [, , zenModeEnabled] = await Promise.all([
    applyThemedIcon(),
    initializeErrorIconCache(),
    getOption('cbx_enableZen'),
  ]);

  createContextMenus(zenModeEnabled);
}
