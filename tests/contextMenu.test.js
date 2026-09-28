/**
 * Unit tests for the toolbar-icon context menu module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/lib/storage.js', () => ({
  store_data: vi.fn(),
  createOldDatabase: vi.fn(),
}));
vi.mock('../src/lib/cache.js', () => ({ cacheGet: vi.fn() }));

import { store_data, createOldDatabase } from '../src/lib/storage.js';
import { cacheGet } from '../src/lib/cache.js';
import {
  createContextMenus,
  handleContextMenuClick,
} from '../src/background/modules/browser/contextMenu.js';

describe('contextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    store_data.mockResolvedValue(undefined);
    globalThis.chrome = {
      contextMenus: {
        removeAll: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleContextMenuClick', () => {
    it('force-refreshes the keyword and folder caches', () => {
      handleContextMenuClick({ menuItemId: 'menuRefreshCache' });

      expect(cacheGet).toHaveBeenCalledWith('keywords', true);
      expect(cacheGet).toHaveBeenCalledWith('folders', true);
    });

    it('creates the old database', () => {
      handleContextMenuClick({ menuItemId: 'menuOldDatabase' });

      expect(createOldDatabase).toHaveBeenCalled();
    });

    it('stores zen mode on and marks the menu item', () => {
      handleContextMenuClick({ menuItemId: 'menuEnableZen', checked: true });

      expect(store_data).toHaveBeenCalledWith('options', {
        cbx_enableZen: true,
      });
      expect(chrome.contextMenus.update).toHaveBeenCalledWith('menuEnableZen', {
        title: '⭢Zen Mode',
        checked: true,
      });
    });

    it('stores zen mode off and resets the menu item', () => {
      handleContextMenuClick({ menuItemId: 'menuEnableZen', checked: false });

      expect(store_data).toHaveBeenCalledWith('options', {
        cbx_enableZen: false,
      });
      expect(chrome.contextMenus.update).toHaveBeenCalledWith('menuEnableZen', {
        title: 'Zen Mode',
        checked: false,
      });
    });

    it('ignores a failed zen-mode write', async () => {
      store_data.mockRejectedValue(new Error('idb down'));

      expect(() =>
        handleContextMenuClick({ menuItemId: 'menuEnableZen', checked: true }),
      ).not.toThrow();
      await Promise.resolve();
    });

    it('survives a missing menu item when updating the title', () => {
      chrome.contextMenus.update.mockImplementation(() => {
        throw new Error('no such item');
      });

      expect(() =>
        handleContextMenuClick({ menuItemId: 'menuEnableZen', checked: true }),
      ).not.toThrow();
    });

    it('ignores unknown menu items', () => {
      handleContextMenuClick({ menuItemId: 'somethingElse' });

      expect(cacheGet).not.toHaveBeenCalled();
      expect(store_data).not.toHaveBeenCalled();
      expect(createOldDatabase).not.toHaveBeenCalled();
    });
  });

  describe('createContextMenus', () => {
    it('recreates the zen checkbox and the refresh entry', () => {
      createContextMenus(true);

      expect(chrome.contextMenus.removeAll).toHaveBeenCalledTimes(1);
      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'menuEnableZen',
        title: 'Zen Mode',
        contexts: ['action'],
        type: 'checkbox',
        checked: true,
      });
      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'menuRefreshCache',
        title: 'Refresh Cache',
        contexts: ['action'],
      });
      expect(chrome.contextMenus.update).toHaveBeenCalledWith('menuEnableZen', {
        title: '⭢Zen Mode',
        checked: true,
      });
    });

    it('keeps going when creating a menu item throws', () => {
      chrome.contextMenus.create.mockImplementation(() => {
        throw new Error('duplicate id');
      });

      expect(() => createContextMenus(false)).not.toThrow();
      expect(chrome.contextMenus.create).toHaveBeenCalledTimes(2);
    });
  });
});
