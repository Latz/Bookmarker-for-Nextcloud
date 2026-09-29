// @ts-check
import { store_data, createOldDatabase } from '../../../lib/storage.js';
import { cacheGet } from '../../../lib/cache.js';

/**
 * Marks the Zen Mode menu entry as on or off by changing its title.
 *
 * This function is only necessary because Vivaldi does not display the check mark in context menus:
 * an enabled entry gets an arrow prefix ("⭢Zen Mode") as a visible substitute.
 * @param {boolean} zenModeEnabled - Whether zen mode is now on.
 */
function setZenModeMenu(zenModeEnabled) {
  console.log('zenModeEnabled', zenModeEnabled);
  try {
    // update() returns a promise in MV3 and rejects when the item does not
    // exist yet (SW cold-started for this event). A try/catch cannot see that
    // rejection, so it is handled on the promise.
    const updating = zenModeEnabled
      ? chrome.contextMenus.update('menuEnableZen', {
          title: '⭢Zen Mode',
          checked: true,
        })
      : chrome.contextMenus.update('menuEnableZen', {
          title: 'Zen Mode',
          checked: false,
        });
    updating?.catch?.(() => {});
  } catch {
    // Menu item may not exist yet if SW cold-started for this event
  }
}

/**
 * Handles a click on one of the toolbar-icon context menu items.
 * Registered by background.js at top level so Chrome delivers the event
 * reliably on SW cold-starts (MV3 requires synchronous listener registration).
 * @param {chrome.contextMenus.OnClickData} info
 * @returns {void}
 */
export function handleContextMenuClick(info) {
  // "Refresh Cache": re-fetch keywords and folders from the server. The second
  // argument of cacheGet forces a refresh instead of using the cached entry.
  if (info.menuItemId === 'menuRefreshCache') {
    for (const type of ['keywords', 'folders']) {
      Promise.resolve(cacheGet(type, true)).catch((error) => {
        console.error(`[contextMenu] refreshing ${type} failed:`, error);
      });
    }
  }
  // Development helper (its menu entry is commented out in createContextMenus).
  if (info.menuItemId === 'menuOldDatabase') {
    void createOldDatabase();
  }
  // Zen Mode checkbox: persist the new state so the popup and the toolbar
  // click behaviour follow it, then update the menu title.
  if (info.menuItemId === 'menuEnableZen') {
    if (info.checked) {
      store_data('options', { cbx_enableZen: true }).catch(() => {});
    } else {
      store_data('options', { cbx_enableZen: false }).catch(() => {});
    }
    setZenModeMenu(info.checked);
  }
}

/**
 * (Re)creates the toolbar-icon context menu.
 * @param {boolean} zenModeEnabled - Initial state of the Zen Mode checkbox.
 * @returns {Promise<void>}
 */
export async function createContextMenus(zenModeEnabled) {
  // Awaited: create() straight after an unfinished removeAll() can hit a
  // duplicate id and leave the item missing or stale.
  try {
    await chrome.contextMenus.removeAll();
  } catch (error) {
    console.warn('[contextMenu] removeAll failed:', error);
  }
  // Entry 1: Zen Mode toggle (a checkbox, shown only on the toolbar icon).
  try {
    chrome.contextMenus.create({
      id: 'menuEnableZen',
      title: 'Zen Mode',
      contexts: ['action'],
      type: 'checkbox',
      checked: zenModeEnabled,
    });
  } catch (error) {
    console.log(error);
  }
  setZenModeMenu(zenModeEnabled);

  // Entry 2: manual cache refresh.
  try {
    chrome.contextMenus.create({
      id: 'menuRefreshCache',
      title: 'Refresh Cache',
      contexts: ['action'],
    });
  } catch (error) {
    console.log(error);
  }

  // only for development purposes
  // chrome.contextMenus.create({
  //   id: 'menuOldDatabase',
  //   title: 'Create old database',
  //   contexts: ['action'],
  // });
}
