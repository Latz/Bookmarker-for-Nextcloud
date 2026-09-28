// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { cacheDbVersion, initCacheStores } from '../src/lib/cacheSchema.js';

describe('cacheSchema', () => {
  it('exposes a positive integer version', () => {
    expect(Number.isInteger(cacheDbVersion)).toBe(true);
    expect(cacheDbVersion).toBeGreaterThan(0);
  });

  it('creates every store cache.js and clearData rely on, keyed by item', () => {
    const db = { createObjectStore: vi.fn() };

    initCacheStores(db);

    expect(db.createObjectStore.mock.calls).toEqual([
      ['keywords', { keyPath: 'item' }],
      ['folders', { keyPath: 'item' }],
      ['bookmarkChecks', { keyPath: 'item' }],
    ]);
  });

  it('does not throw when a store already exists', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = {
      createObjectStore: vi.fn(() => {
        throw new Error('ConstraintError');
      }),
    };

    expect(() => initCacheStores(db)).not.toThrow();
    log.mockRestore();
  });
});
