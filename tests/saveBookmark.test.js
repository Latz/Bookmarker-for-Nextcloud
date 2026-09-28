/**
 * Unit tests for the saveBookmark service-worker module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/lib/apiCall.js', () => ({ default: vi.fn() }));
vi.mock('../src/lib/storage.js', () => ({ store_data: vi.fn() }));
vi.mock('../src/lib/cache.js', () => ({
  cacheGet: vi.fn(),
  cacheTempAdd: vi.fn(),
}));
vi.mock('../src/background/modules/notification.js', () => ({
  notifyUser: vi.fn(),
}));

import apiCall from '../src/lib/apiCall.js';
import { store_data } from '../src/lib/storage.js';
import { cacheGet, cacheTempAdd } from '../src/lib/cache.js';
import { notifyUser } from '../src/background/modules/notification.js';
import { saveBookmark } from '../src/background/modules/saveBookmark.js';

const BASE = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('saveBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.chrome = { action: { setBadgeText: vi.fn() } };
    apiCall.mockResolvedValue({ status: 'success' });
    store_data.mockResolvedValue(undefined);
    cacheGet.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new bookmark with POST when there is no bookmark ID', async () => {
    const data = new URLSearchParams({ url: 'https://example.com' });

    await saveBookmark(data, ['1'], 0);

    expect(apiCall).toHaveBeenCalledWith(BASE, 'POST', data);
  });

  it('updates an existing bookmark with PUT', async () => {
    const data = new URLSearchParams({ url: 'https://example.com' });

    await saveBookmark(data, ['1'], 42);

    expect(apiCall).toHaveBeenCalledWith(`${BASE}/42`, 'PUT', data);
  });

  it('shows the badge while saving and clears it afterwards', async () => {
    await saveBookmark(new URLSearchParams(), [], 0);

    expect(chrome.action.setBadgeText.mock.calls).toEqual([
      [{ text: '💾' }],
      [{ text: '' }],
    ]);
  });

  it('stores the selected folders and notifies the user', async () => {
    const response = { status: 'success' };
    apiCall.mockResolvedValue(response);

    await saveBookmark(new URLSearchParams(), ['3', '4'], 0);

    expect(store_data).toHaveBeenCalledWith('options', {
      folderIDs: ['3', '4'],
    });
    expect(notifyUser).toHaveBeenCalledWith(response);
  });

  describe('keyword cache update', () => {
    it('adds only tags that are not cached yet, case-insensitively', async () => {
      cacheGet.mockResolvedValue(['NASA']);
      const data = new URLSearchParams();
      data.append('tags[]', 'nasa');
      data.append('tags[]', 'Rockets');

      await saveBookmark(data, [], 0);
      await flush();

      expect(cacheTempAdd).toHaveBeenCalledWith('keywords', ['Rockets']);
    });

    it('does nothing when no tags were saved', async () => {
      const data = new URLSearchParams();
      data.append('tags[]', '');

      await saveBookmark(data, [], 0);
      await flush();

      expect(cacheGet).not.toHaveBeenCalled();
      expect(cacheTempAdd).not.toHaveBeenCalled();
    });

    it('is skipped when the save failed', async () => {
      apiCall.mockResolvedValue({ status: 'error' });
      const data = new URLSearchParams();
      data.append('tags[]', 'new');

      await saveBookmark(data, [], 0);
      await flush();

      expect(cacheTempAdd).not.toHaveBeenCalled();
    });

    it('logs a cache failure instead of throwing', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      cacheGet.mockRejectedValue(new Error('idb down'));
      const data = new URLSearchParams();
      data.append('tags[]', 'new');

      await expect(saveBookmark(data, [], 0)).resolves.toBeUndefined();
      await flush();

      expect(spy).toHaveBeenCalledWith(
        'Error updating cache:',
        expect.objectContaining({ message: 'idb down' }),
      );
    });
  });
});
