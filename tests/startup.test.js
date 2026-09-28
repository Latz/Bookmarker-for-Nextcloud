/**
 * Unit tests for the service-worker startup sequence
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/lib/apiCall.js', () => ({ default: vi.fn() }));
vi.mock('../src/lib/storage.js', () => ({
  getOption: vi.fn(),
  load_data: vi.fn(),
}));
vi.mock('../src/background/modules/notification.js', () => ({
  initializeErrorIconCache: vi.fn(),
}));
vi.mock('../src/background/modules/getBrowserTheme.js', () => ({
  default: vi.fn(),
}));
vi.mock('../src/background/modules/contextMenu.js', () => ({
  createContextMenus: vi.fn(),
}));

import apiCall from '../src/lib/apiCall.js';
import { getOption, load_data } from '../src/lib/storage.js';
import { initializeErrorIconCache } from '../src/background/modules/notification.js';
import getBrowserTheme from '../src/background/modules/getBrowserTheme.js';
import { createContextMenus } from '../src/background/modules/contextMenu.js';
import { init } from '../src/background/modules/startup.js';

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
});
