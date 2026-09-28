// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/storage.js', () => ({
  load_data: vi.fn(),
  getOption: vi.fn(),
  getOptions: vi.fn(),
}));
vi.mock('../src/popup/modules/dataRequest.js', () => ({
  getDataWithRetry: vi.fn(),
}));
vi.mock('../src/popup/modules/fillKeywords.js', () => ({
  preloadKeywordAssets: vi.fn(),
}));

import {
  load_data,
  getOption,
  getOptions,
} from '../src/lib/storage.js';
import { getDataWithRetry } from '../src/popup/modules/dataRequest.js';
import { preloadKeywordAssets } from '../src/popup/modules/fillKeywords.js';
import {
  startSession,
  prefetchFormOptions,
} from '../src/popup/modules/session.js';

/** load_data('credentials', key) answers from this object */
function credentials(values) {
  load_data.mockImplementation(async (_store, key) => values[key]);
}

describe('startSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.chrome = {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
    };
    getOption.mockResolvedValue(false); // zen mode off
    getOptions.mockResolvedValue({});
    getDataWithRetry.mockReturnValue(Promise.resolve({ ok: true }));
  });

  it('starts getData at once when logged in and the server permission is granted', async () => {
    credentials({ appPassword: 'pw', server: 'https://cloud.example.com/nc' });

    const session = await startSession();

    // the permission is checked for the origin, not the full server path
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ['https://cloud.example.com/*'],
    });
    expect(getDataWithRetry).toHaveBeenCalledTimes(1);
    expect(session.needsReconnect).toBe(false);
    await expect(session.dataPromise).resolves.toEqual({ ok: true });
  });

  it('asks to reconnect instead of calling getData when the permission is missing', async () => {
    credentials({ appPassword: 'pw', server: 'https://cloud.example.com' });
    chrome.permissions.contains.mockResolvedValue(false);

    const session = await startSession();

    // getData would fail without a clear reason (the update dropped the grant)
    expect(getDataWithRetry).not.toHaveBeenCalled();
    expect(session.needsReconnect).toBe(true);
    expect(session.dataPromise).toBeNull();
  });

  it.each([
    ['a missing server', undefined],
    ['an unparsable server', 'not a url'],
  ])('needs a reconnect for %s, without throwing', async (_label, server) => {
    credentials({ appPassword: 'pw', server });

    const session = await startSession();

    expect(chrome.permissions.contains).not.toHaveBeenCalled();
    expect(session.needsReconnect).toBe(true);
    expect(getDataWithRetry).not.toHaveBeenCalled();
  });

  it('does not touch the page when not logged in (login path)', async () => {
    credentials({ server: 'https://cloud.example.com' });

    const session = await startSession();

    expect(getDataWithRetry).not.toHaveBeenCalled();
    expect(session.dataPromise).toBeNull();
    expect(session.needsReconnect).toBe(false);
    expect(session.apppwd).toBeUndefined();
  });

  it('does not touch the page in zen mode (it saves without the form)', async () => {
    credentials({ appPassword: 'pw', server: 'https://cloud.example.com' });
    getOption.mockResolvedValue(true);

    const session = await startSession();

    expect(getDataWithRetry).not.toHaveBeenCalled();
    expect(session.enableZen).toBe(true);
    expect(session.dataPromise).toBeNull();
  });
});

describe('prefetchFormOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preloads the keyword assets only when keywords are shown', async () => {
    getOptions.mockResolvedValue({ cbx_showKeywords: true });
    prefetchFormOptions();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(preloadKeywordAssets).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    getOptions.mockResolvedValue({ cbx_showKeywords: false });
    prefetchFormOptions();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(preloadKeywordAssets).not.toHaveBeenCalled();
  });

  it('is fire-and-forget: a failing read must not become an unhandled rejection', async () => {
    getOptions.mockRejectedValue(new Error('storage down'));

    expect(() => prefetchFormOptions()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(preloadKeywordAssets).not.toHaveBeenCalled();
  });
});
