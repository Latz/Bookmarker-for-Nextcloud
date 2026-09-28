// @ts-check
import { store_data, createOldDatabase } from '../../lib/storage.js';
import { cacheGet } from '../../lib/cache.js';

// This function is only necessary because Vivaldi does not display the check mark in context menus.
function setZenModeMenu(zenModeEnabled) {
  console.log('zenModeEnabled', zenModeEnabled);
  try {
    if (zenModeEnabled) {
      chrome.contextMenus.update('menuEnableZen', {
        title: '⭢Zen Mode',
        checked: true,
      });
    } else {
      chrome.contextMenus.update('menuEnableZen', {
        title: 'Zen Mode',
        checked: false,
      });
    }
  } catch (error) {
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
  if (info.menuItemId === 'menuRefreshCache') {
    cacheGet('keywords', true);
    cacheGet('folders', true);
  }
  if (info.menuItemId === 'menuOldDatabase') {
    createOldDatabase();
  }
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
 * @returns {void}
 */
export function createContextMenus(zenModeEnabled) {
  chrome.contextMenus.removeAll();
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
