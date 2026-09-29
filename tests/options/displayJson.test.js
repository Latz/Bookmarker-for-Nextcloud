// @vitest-environment happy-dom
/**
 * Tests for the real displayJson module (the developer view opened from the
 * options page). It uses top-level await and reads window.location, so each
 * test sets the URL and imports a fresh copy.
 *
 * This file used to re-implement the module's logic inline, so a wrong
 * hard-coded database version in the module could not fail it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('idb', () => ({ openDB: vi.fn() }));
vi.mock('../../src/lib/storage.js', () => ({ load_data_all: vi.fn() }));

async function show(search) {
  window.happyDOM.setURL(`http://localhost/displayJson.html${search}`);
  document.body.innerHTML = '<div id="jsondata"></div>';
  vi.resetModules();
  // Re-import the mocks: resetModules gave the module fresh instances
  const { openDB } = await import('idb');
  const { load_data_all } = await import('../../src/lib/storage.js');
  const { cacheDbVersion, initCacheStores } = await import(
    '../../src/lib/cacheSchema.js'
  );
  return {
    openDB,
    load_data_all,
    cacheDbVersion,
    initCacheStores,
    run: async () => {
      await import('../../src/options/displayJson.js');
      return document.querySelector('#jsondata pre')?.textContent;
    },
  };
}

describe('displayJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the stored options for ?type=options', async () => {
    const ctx = await show('?type=options');
    ctx.load_data_all.mockResolvedValue([{ item: 'cbx_showUrl', value: true }]);

    const text = await ctx.run();

    expect(ctx.load_data_all).toHaveBeenCalledWith('options');
    expect(JSON.parse(text)).toEqual([{ item: 'cbx_showUrl', value: true }]);
  });

  it('reads the cache with the schema version and upgrade, and closes the connection', async () => {
    const ctx = await show('?type=cache');
    const db = {
      get: vi.fn().mockResolvedValue({ item: 'keywords', value: ['a', 'b'] }),
      close: vi.fn(),
    };
    ctx.openDB.mockResolvedValue(db);

    const text = await ctx.run();

    // A hard-coded old version (it was 2) fails with a VersionError; without
    // the upgrade callback an empty database would be created instead.
    expect(ctx.openDB).toHaveBeenCalledWith('BookmarkerCache', ctx.cacheDbVersion, {
      upgrade: ctx.initCacheStores,
    });
    expect(db.get).toHaveBeenCalledWith('keywords', 'keywords');
    expect(db.close).toHaveBeenCalled();
    expect(JSON.parse(text).value).toEqual(['a', 'b']);
  });

  it('parses the type from a URL with further parameters', async () => {
    const ctx = await show('?extra=1&type=options');
    ctx.load_data_all.mockResolvedValue([]);

    await ctx.run();

    expect(ctx.load_data_all).toHaveBeenCalledWith('options');
  });

  it.each(['', '?other=value', '?type=nonsense'])(
    'reads nothing for %j',
    async (search) => {
      const ctx = await show(search);

      await expect(ctx.run()).resolves.not.toThrow;

      expect(ctx.load_data_all).not.toHaveBeenCalled();
      expect(ctx.openDB).not.toHaveBeenCalled();
    },
  );

  it('shows the error instead of a blank page when the database cannot be opened', async () => {
    const ctx = await show('?type=cache');
    ctx.openDB.mockRejectedValue(new Error('VersionError'));

    const text = await ctx.run();

    expect(JSON.parse(text)).toEqual({ error: 'VersionError' });
  });

  it('shows the error when the options cannot be read', async () => {
    const ctx = await show('?type=options');
    ctx.load_data_all.mockRejectedValue(new Error('Storage error'));

    const text = await ctx.run();

    expect(JSON.parse(text)).toEqual({ error: 'Storage error' });
  });
});
