/**
 * Tests for the bookmark-check paths of getData: cache hits, request
 * deduplication, title-similarity matching and abort handling.
 * The basic flow is covered in getData.test.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

globalThis.chrome = {
  tabs: { query: vi.fn() },
  scripting: { executeScript: vi.fn() },
};

vi.mock('../../src/background/modules/page/getDescription.js', () => ({
  default: vi.fn(() => 'desc'),
}));
vi.mock('../../src/background/modules/page/getKeywords.js', () => ({
  default: vi.fn(() => Promise.resolve(['kw'])),
}));
vi.mock('../../src/background/modules/bookmarks/getFolders.js', () => ({
  getFolders: vi.fn(() => Promise.resolve([1])),
}));
vi.mock('../../src/lib/apiCall.js', () => ({ default: vi.fn() }));
vi.mock('../../src/lib/storage.js', () => ({ getOptions: vi.fn() }));
vi.mock('../../src/lib/log.js', () => ({ default: vi.fn() }));
vi.mock('../../src/lib/urlNormalizer.js', () => ({ normalizeUrl: vi.fn() }));
vi.mock('../../src/lib/cache.js', () => ({
  getCachedBookmarkCheck: vi.fn(),
  cacheBookmarkCheck: vi.fn(),
}));
vi.mock('../../src/lib/stringSimilarity.js', () => ({
  batchSimilarityCheck: vi.fn(),
}));

import getData from '../../src/background/modules/bookmarks/getData.js';
import apiCall from '../../src/lib/apiCall.js';
import { getOptions } from '../../src/lib/storage.js';
import { normalizeUrl } from '../../src/lib/urlNormalizer.js';
import {
  getCachedBookmarkCheck,
  cacheBookmarkCheck,
} from '../../src/lib/cache.js';
import { batchSimilarityCheck } from '../../src/lib/stringSimilarity.js';

const URL_A = 'https://example.com/a';
const EMPTY_CHECK = { ok: true, found: false, matches: [], count: 0 };

function emptyParsedData() {
  return {
    metaTags: [],
    aRelTag: [],
    aRelCategory: [],
    jsonLdScripts: [],
    scripts: [],
    githubTopics: [],
    nextData: '',
    description: [],
    headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
    xplKeywords: [],
    bruteForceKeywords: [],
  };
}

let options;

function tab(id, url = URL_A) {
  return { id, url, title: 'Title' };
}

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  options = {
    cbx_alreadyStored: true,
    cbx_cacheBookmarkChecks: false,
    cbx_fuzzyUrlMatch: false,
    cbx_titleSimilarityCheck: false,
    input_headings_slider: 3,
    input_titleCheckLimit: 20,
    input_titleSimilarityThreshold: 75,
  };
  getOptions.mockReset();
  getOptions.mockImplementation((keys) =>
    Promise.resolve(Object.fromEntries(keys.map((k) => [k, options[k]]))),
  );
  apiCall.mockReset();
  apiCall.mockResolvedValue({ status: 'success', data: [] });
  normalizeUrl.mockReset();
  normalizeUrl.mockImplementation((url) => url);
  getCachedBookmarkCheck.mockReset();
  getCachedBookmarkCheck.mockResolvedValue(null);
  cacheBookmarkCheck.mockReset();
  batchSimilarityCheck.mockReset();
  batchSimilarityCheck.mockReturnValue([]);
  chrome.tabs.query.mockReset();
  chrome.tabs.query.mockResolvedValue([tab(1)]);
  chrome.scripting.executeScript.mockReset();
  chrome.scripting.executeScript.mockResolvedValue([
    { result: emptyParsedData() },
  ]);
});

describe('getData - bookmark check disabled', () => {
  it('skips the server check when cbx_alreadyStored is off', async () => {
    options.cbx_alreadyStored = false;

    const result = await getData();

    expect(apiCall).not.toHaveBeenCalled();
    expect(result.checkBookmark).toEqual(EMPTY_CHECK);
    expect(result.bookmarkID).toBe(-1);
  });
});

describe('getData - bookmark check cache', () => {
  beforeEach(() => {
    options.cbx_cacheBookmarkChecks = true;
  });

  it('uses a cache hit for the exact URL without calling the server', async () => {
    getCachedBookmarkCheck.mockResolvedValueOnce(EMPTY_CHECK);

    const result = await getData();

    expect(getCachedBookmarkCheck).toHaveBeenCalledWith(
      URL_A,
      expect.any(Object),
    );
    expect(apiCall).not.toHaveBeenCalled();
    expect(result.checkBookmark).toEqual(EMPTY_CHECK);
  });

  it('falls back to the normalized URL when the exact URL is not cached', async () => {
    normalizeUrl.mockReturnValue('https://example.com/a-normalized');
    getCachedBookmarkCheck
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(EMPTY_CHECK);

    const result = await getData();

    expect(getCachedBookmarkCheck).toHaveBeenNthCalledWith(
      2,
      'https://example.com/a-normalized',
      expect.any(Object),
    );
    expect(apiCall).not.toHaveBeenCalled();
    expect(result.checkBookmark).toEqual(EMPTY_CHECK);
  });

  it('queries the server when neither URL variant is cached', async () => {
    normalizeUrl.mockReturnValue('https://example.com/a-normalized');

    await getData();

    expect(getCachedBookmarkCheck).toHaveBeenCalledTimes(2);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it('queries the server when the URL is already normalized and uncached', async () => {
    await getData();

    expect(getCachedBookmarkCheck).toHaveBeenCalledTimes(1);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it('caches a successful result under the normalized key when fuzzy matching is on', async () => {
    options.cbx_fuzzyUrlMatch = true;
    normalizeUrl.mockReturnValue('https://example.com/a-normalized');

    await getData();

    expect(cacheBookmarkCheck).toHaveBeenCalledWith(
      'https://example.com/a-normalized',
      expect.objectContaining({ ok: true, found: false }),
      expect.any(Object),
    );
    // The lookup URL sent to the server is the normalized one, too.
    expect(apiCall.mock.calls[0][2]).toContain(
      encodeURIComponent('https://example.com/a-normalized'),
    );
  });
});

describe('getData - exact URL match', () => {
  it('returns the stored bookmark and caches it', async () => {
    const stored = {
      id: 42,
      url: URL_A,
      title: 'Stored',
      tags: ['x', 'y'],
      folders: [7],
    };
    apiCall.mockResolvedValueOnce({ status: 'success', data: [stored] });

    const result = await getData();

    expect(result.found).toBe(true);
    expect(result.bookmarkID).toBe(42);
    expect(result.keywords).toEqual(['x', 'y']);
    expect(cacheBookmarkCheck).toHaveBeenCalledTimes(1);
  });

  it('drops the title check when the URL already matched', async () => {
    options.cbx_titleSimilarityCheck = true;
    const titleResponse = deferred();
    apiCall
      .mockResolvedValueOnce({
        status: 'success',
        data: [{ id: 1, url: URL_A, title: 'Stored', tags: [], folders: [] }],
      })
      .mockReturnValueOnce(titleResponse.promise);

    const result = await getData();

    // The title request was started alongside the URL lookup, then aborted
    // because its answer is not needed; its late response is ignored.
    expect(apiCall).toHaveBeenCalledTimes(2);
    const titleSignal = apiCall.mock.calls[1][3];
    expect(titleSignal.aborted).toBe(true);
    titleResponse.resolve({ status: 'success', data: [{ id: 5 }] });
    await tick();
    expect(batchSimilarityCheck).not.toHaveBeenCalled();
    expect(result.bookmarkID).toBe(1);
  });
});

describe('getData - title similarity check', () => {
  beforeEach(() => {
    options.cbx_titleSimilarityCheck = true;
  });

  it('reports a similar title as the match when the URL is unknown', async () => {
    apiCall
      .mockResolvedValueOnce({ status: 'success', data: [] }) // checkByUrl
      .mockResolvedValueOnce({ status: 'success', data: [{ id: 9 }] }); // checkByTitle
    batchSimilarityCheck.mockReturnValueOnce([
      { id: 9, title: 'Similar', similarity: 0.9, tags: ['t'], folders: [2] },
    ]);

    const result = await getData();

    expect(batchSimilarityCheck).toHaveBeenCalledWith(
      'Title',
      [{ id: 9 }],
      0.75,
    );
    expect(result.found).toBe(true);
    expect(result.bookmarkID).toBe(9);
    expect(result.matchType).toBe('title');
    expect(result.count).toBe(1);
    expect(cacheBookmarkCheck).toHaveBeenCalledTimes(1);
  });

  it('starts the title lookup without waiting for the URL lookup', async () => {
    const urlResponse = deferred();
    apiCall
      .mockReturnValueOnce(urlResponse.promise) // checkByUrl, still pending
      .mockResolvedValueOnce({ status: 'success', data: [{ id: 9 }] }); // checkByTitle
    batchSimilarityCheck.mockReturnValueOnce([
      { id: 9, title: 'Similar', similarity: 0.9, tags: [], folders: [] },
    ]);

    const pending = getData();
    await tick();

    // Both requests are out before the URL lookup has answered.
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(apiCall.mock.calls[0][2]).toContain('url=');
    expect(apiCall.mock.calls[1][2]).toContain('limit=');

    urlResponse.resolve({ status: 'success', data: [] });
    const result = await pending;
    expect(result.matchType).toBe('title');
  });

  it('sorts several title matches by similarity, best first', async () => {
    apiCall
      .mockResolvedValueOnce({ status: 'success', data: [] })
      .mockResolvedValueOnce({ status: 'success', data: [] });
    batchSimilarityCheck.mockReturnValueOnce([
      { id: 1, title: 'Low', similarity: 0.6, tags: [], folders: [] },
      { id: 2, title: 'High', similarity: 0.95, tags: [], folders: [] },
      { id: 3, title: 'Unscored', tags: [], folders: [] },
    ]);

    const result = await getData();

    expect(result.count).toBe(3);
    expect(result.matches.map((m) => m.id)).toEqual([2, 1, 3]);
    expect(result.bookmarkID).toBe(2);
  });

  it('applies the configured limit and threshold, with defaults as fallback', async () => {
    options.input_titleCheckLimit = 0;
    options.input_titleSimilarityThreshold = 0;

    await getData();

    const titleCall = apiCall.mock.calls[1];
    expect(titleCall[2]).toContain('limit=20');
    expect(batchSimilarityCheck).toHaveBeenCalledWith('Title', [], 0.75);
  });

  it('treats an API error during the title check as no match', async () => {
    apiCall
      .mockResolvedValueOnce({ status: 'success', data: [] })
      .mockResolvedValueOnce({ status: 'error', statusText: 'boom' });

    const result = await getData();

    expect(batchSimilarityCheck).not.toHaveBeenCalled();
    expect(result.bookmarkID).toBe(-1);
    expect(result.checkBookmark.found).toBe(false);
  });

  it('treats an exception during the title check as no match', async () => {
    apiCall
      .mockResolvedValueOnce({ status: 'success', data: [] })
      .mockRejectedValueOnce(new Error('network down'));

    const result = await getData();

    expect(result.ok).toBe(true);
    expect(result.bookmarkID).toBe(-1);
  });

  it('skips the title check when the tab has no title', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 1, url: URL_A, title: '' }]);

    await getData();

    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed URL lookup', async () => {
    apiCall
      .mockResolvedValueOnce({ status: -1, statusText: 'Failed to fetch' })
      .mockResolvedValueOnce({ status: 'success', data: [] });

    const result = await getData();

    expect(result.checkBookmark.ok).toBe(false);
    expect(cacheBookmarkCheck).not.toHaveBeenCalled();
  });
});

describe('getData - concurrent requests', () => {
  it('shares one server request between two tabs checking the same URL', async () => {
    const pending = deferred();
    apiCall.mockReturnValueOnce(pending.promise);
    chrome.tabs.query
      .mockResolvedValueOnce([tab(1)])
      .mockResolvedValueOnce([tab(2)]);

    const first = getData();
    await vi.waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1));
    const second = getData();
    await tick();

    pending.resolve({
      status: 'success',
      data: [{ id: 5, url: URL_A, title: 'Stored', tags: [], folders: [] }],
    });
    const [a, b] = await Promise.all([first, second]);

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(a.bookmarkID).toBe(5);
    expect(b.bookmarkID).toBe(5);
  });

  it('rejects a waiting request with AbortError when its tab starts a newer request', async () => {
    const pending = deferred();
    apiCall.mockReturnValueOnce(pending.promise);
    chrome.tabs.query
      .mockResolvedValueOnce([tab(1)])
      .mockResolvedValueOnce([tab(2)])
      .mockResolvedValueOnce([tab(2)]);

    const first = getData();
    await vi.waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1));
    const waiting = getData().catch((error) => error);
    await tick();
    const replacement = getData();
    await tick();

    pending.resolve({ status: 'success', data: [] });

    const error = await waiting;
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');
    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(replacement).resolves.toMatchObject({ ok: true });
  });

  it('throws AbortError when the tab is superseded while the URL lookup is in flight', async () => {
    const pending = deferred();
    apiCall
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ status: 'success', data: [] });
    chrome.tabs.query
      .mockResolvedValueOnce([tab(1)])
      .mockResolvedValueOnce([tab(1, 'https://example.com/other')]);

    const first = getData().catch((error) => error);
    await vi.waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1));
    const second = getData();

    pending.resolve({ status: 'success', data: [] });

    const error = await first;
    expect(error.name).toBe('AbortError');
    await expect(second).resolves.toMatchObject({ ok: true });
  });
});
