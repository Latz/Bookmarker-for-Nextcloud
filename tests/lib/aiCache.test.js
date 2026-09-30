// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearAiCache,
  getAiCached,
  setAiCached,
} from '../../src/lib/aiCache.js';

describe('aiCache', () => {
  let store;

  beforeEach(() => {
    vi.useRealTimers();
    store = {};
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: store[key] })),
          set: vi.fn(async (values) => Object.assign(store, values)),
          remove: vi.fn(async (key) => {
            delete store[key];
          }),
        },
      },
    };
  });

  it('returns what was stored for the same page, however the URL is spelled', async () => {
    await setAiCached('https://www.example.com/a/?b=2&a=1#top', {
      keywords: ['x'],
    });

    const entry = await getAiCached('http://example.com/a/?a=1&b=2');

    expect(entry.keywords).toEqual(['x']);
  });

  it('merges new fields into an existing entry', async () => {
    await setAiCached('https://example.com/', { keywords: ['x'] });
    await setAiCached('https://example.com/', { description: 'd' });

    expect(await getAiCached('https://example.com/')).toMatchObject({
      keywords: ['x'],
      description: 'd',
    });
  });

  it('stores nothing for empty suggestions or without a URL', async () => {
    await setAiCached('https://example.com/', {});
    await setAiCached(undefined, { keywords: ['x'] });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(await getAiCached(undefined)).toBeNull();
  });

  it('forgets entries after a week', async () => {
    vi.useFakeTimers();
    await setAiCached('https://example.com/', { keywords: ['x'] });
    vi.advanceTimersByTime(6 * 24 * 3600 * 1000);
    expect(await getAiCached('https://example.com/')).not.toBeNull();
    vi.advanceTimersByTime(2 * 24 * 3600 * 1000);
    expect(await getAiCached('https://example.com/')).toBeNull();
  });

  it('keeps at most 100 pages, dropping the oldest', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 101; i++) {
      vi.advanceTimersByTime(1000);
      await setAiCached(`https://example.com/${i}`, { keywords: ['x'] });
    }
    expect(await getAiCached('https://example.com/0')).toBeNull();
    expect(await getAiCached('https://example.com/1')).not.toBeNull();
    expect(await getAiCached('https://example.com/100')).not.toBeNull();
  });

  it('clears everything and never throws without a storage API', async () => {
    await setAiCached('https://example.com/', { keywords: ['x'] });
    await clearAiCache();
    expect(await getAiCached('https://example.com/')).toBeNull();

    globalThis.chrome = {};
    await expect(clearAiCache()).resolves.toBeUndefined();
    await expect(getAiCached('https://example.com/')).resolves.toBeNull();
  });
});
