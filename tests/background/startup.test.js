/**
 * Unit tests for the service-worker startup sequence
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/lib/apiCall.js', () => ({ default: vi.fn() }));
vi.mock('../../src/lib/storage.js', () => ({
  getOption: vi.fn(),
  load_data: vi.fn(),
  store_data: vi.fn(),
  ensureDefaults: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../src/background/modules/browser/notification.js', () => ({
  initializeErrorIconCache: vi.fn(),
}));
vi.mock('../../src/background/modules/browser/getBrowserTheme.js', () => ({
  default: vi.fn(),
}));
vi.mock('../../src/background/modules/browser/contextMenu.js', () => ({
  createContextMenus: vi.fn(),
}));

import apiCall from '../../src/lib/apiCall.js';
import {
  getOption,
  load_data,
  store_data,
  ensureDefaults,
} from '../../src/lib/storage.js';
import { initializeErrorIconCache } from '../../src/background/modules/browser/notification.js';
import getBrowserTheme from '../../src/background/modules/browser/getBrowserTheme.js';
import { createContextMenus } from '../../src/background/modules/browser/contextMenu.js';
import { init } from '../../src/background/modules/startup.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startup init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.chrome = { action: { setIcon: vi.fn() } };
    load_data.mockResolvedValue('https://cloud.example.com');
    getOption.mockResolvedValue(true);
    initializeErrorIconCache.mockResolvedValue(undefined);
    getBrowserTheme.mockResolvedValue('dark');
    apiCall.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets the themed icon in the four supported sizes', async () => {
    await init();

    expect(chrome.action.setIcon).toHaveBeenCalledWith({
      path: {
        16: '/images/icon-16x16-dark.png',
        32: '/images/icon-32x32-dark.png',
        64: '/images/icon-64x64-dark.png',
        128: '/images/icon-128x128-dark.png',
      },
    });
  });

  it('keeps starting when theme detection fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getBrowserTheme.mockRejectedValue(new Error('no theme'));

    await init();

    expect(chrome.action.setIcon).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      'Failed to detect browser theme, using default:',
      expect.objectContaining({ message: 'no theme' }),
    );
    expect(createContextMenus).toHaveBeenCalled();
  });

  it('builds the context menu with the stored zen mode state', async () => {
    getOption.mockResolvedValue(true);

    await init();

    expect(getOption).toHaveBeenCalledWith('cbx_enableZen');
    expect(createContextMenus).toHaveBeenCalledWith(true);
    expect(initializeErrorIconCache).toHaveBeenCalled();
  });

  it('warms up the connection when a server is configured', async () => {
    await init();
    await flush();

    expect(apiCall).toHaveBeenCalledWith(
      'index.php/apps/bookmarks/public/rest/v2/bookmark',
      'GET',
      'page=0&limit=1',
    );
  });

  describe('warm-up rate limit', () => {
    // The stamp lives in the 'misc' store; every other read returns the server URL.
    let stamp;

    beforeEach(() => {
      stamp = undefined;
      load_data.mockImplementation(async (store) =>
        store === 'misc' ? stamp : 'https://cloud.example.com',
      );
      store_data.mockImplementation(async (store, items) => {
        stamp = items.lastConnectionWarmup;
      });
    });

    it('records the warm-up so the next start can skip it', async () => {
      await init();
      await flush();

      expect(apiCall).toHaveBeenCalledTimes(1);
      expect(store_data).toHaveBeenCalledWith('misc', {
        lastConnectionWarmup: expect.any(Number),
      });
    });

    it('skips the warm-up when one ran less than five minutes ago', async () => {
      stamp = Date.now() - 60 * 1000;

      await init();
      await flush();

      expect(apiCall).not.toHaveBeenCalled();
      expect(store_data).not.toHaveBeenCalled();
    });

    it('warms up again once the interval has passed', async () => {
      stamp = Date.now() - 6 * 60 * 1000;

      await init();
      await flush();

      expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('skips the second of two starts in a row', async () => {
      await init();
      await flush();
      await init();
      await flush();

      expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('still warms up when the stamp cannot be read', async () => {
      load_data.mockImplementation(async (store) => {
        if (store === 'misc') throw new Error('unavailable');
        return 'https://cloud.example.com';
      });

      await init();
      await flush();

      expect(apiCall).toHaveBeenCalledTimes(1);
    });
  });

  it('skips the warm-up without a server', async () => {
    load_data.mockResolvedValue(undefined);

    await init();
    await flush();

    expect(apiCall).not.toHaveBeenCalled();
  });

  it('does not fail startup when the warm-up fails', async () => {
    apiCall.mockRejectedValue(new Error('offline'));

    await expect(init()).resolves.toBeUndefined();
    await flush();
  });

  it('still creates the context menu when reading the zen option fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getOption.mockRejectedValue(new Error('IndexedDB unavailable'));

    await expect(init()).resolves.toBeUndefined();

    // Promise.all used to reject here, so the menu was never created.
    expect(createContextMenus).toHaveBeenCalledWith(false);
    expect(spy).toHaveBeenCalledWith(
      '[startup] init step failed:',
      expect.objectContaining({ message: 'IndexedDB unavailable' }),
    );
  });

  it('still creates the context menu when the error-icon cache fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    initializeErrorIconCache.mockRejectedValue(new Error('fetch failed'));

    await init();

    expect(createContextMenus).toHaveBeenCalledWith(true);
    spy.mockRestore();
  });

  it('adds missing default options without blocking or failing startup', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ensureDefaults.mockRejectedValueOnce(new Error('quota'));

    await expect(init()).resolves.toBeUndefined();
    await flush();

    expect(ensureDefaults).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      '[startup] could not add missing default options:',
      expect.objectContaining({ message: 'quota' }),
    );
  });
});
