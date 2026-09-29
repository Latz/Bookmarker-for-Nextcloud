/**
 * Unit tests for reduceKeywords / buildKeywordLookup
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/cache.js', () => ({
  cacheGet: vi.fn(),
}));

vi.mock('../../src/lib/storage.js', () => ({
  getOption: vi.fn(),
}));

import { cacheGet } from '../../src/lib/cache.js';
import { getOption } from '../../src/lib/storage.js';
import {
  buildKeywordLookup,
  reduceKeywords,
} from '../../src/background/modules/page/keywords/reduceKeywords.js';

describe('buildKeywordLookup', () => {
  it('lowercases the stored keywords into a Set', () => {
    const lookup = buildKeywordLookup(['NASA', 'Space']);

    expect(lookup).toBeInstanceOf(Set);
    expect([...lookup]).toEqual(['nasa', 'space']);
  });

  it.each([
    ['undefined', undefined],
    ['an empty list', []],
    ['an API error object', { ok: false }],
  ])('returns null for %s', (_label, input) => {
    expect(buildKeywordLookup(input)).toBeNull();
  });
});

describe('reduceKeywords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOption.mockResolvedValue(true);
    cacheGet.mockResolvedValue(['NASA', 'space']);
  });

  it('keeps only keywords that are stored, case-insensitively', async () => {
    const result = await reduceKeywords(['nasa', 'Space', 'other']);

    expect(result).toEqual(['nasa', 'Space']);
    expect(cacheGet).toHaveBeenCalledWith('keywords');
  });

  it('removes duplicates', async () => {
    const result = await reduceKeywords(['nasa', 'nasa', 'space']);

    expect(result).toEqual(['nasa', 'space']);
  });

  it('returns the keywords untouched when reduction is disabled', async () => {
    getOption.mockResolvedValue(false);

    const result = await reduceKeywords(['unknown', 'unknown']);

    expect(result).toEqual(['unknown', 'unknown']);
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('reduces anyway when forced', async () => {
    getOption.mockResolvedValue(false);

    const result = await reduceKeywords(['nasa', 'other'], true);

    expect(result).toEqual(['nasa']);
  });

  it('uses a prebuilt lookup without touching the cache', async () => {
    const lookup = new Set(['abc']);

    const result = await reduceKeywords(['ABC', 'def'], true, lookup, true);

    expect(result).toEqual(['ABC']);
    expect(cacheGet).not.toHaveBeenCalled();
    expect(getOption).not.toHaveBeenCalled();
  });

  it('returns [] when nothing is stored', async () => {
    cacheGet.mockResolvedValue([]);

    expect(await reduceKeywords(['nasa'])).toEqual([]);
  });

  it('returns [] when the cache holds an API error object', async () => {
    cacheGet.mockResolvedValue({ ok: false });

    expect(await reduceKeywords(['nasa'])).toEqual([]);
  });
});
