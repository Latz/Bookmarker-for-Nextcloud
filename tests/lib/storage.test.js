// @vitest-environment node
/**
 * Unit tests for storage.js: chrome.storage.local (in-memory area from
 * tests/storageArea.js, fresh per test via setup.js), option caching, and the
 * one-time migration from the old IndexedDB (fake-indexeddb).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDB, deleteDB } from 'idb';

import {
  load_data,
  load_data_all,
  store_data,
  delete_data,
  getOption,
  getOptions,
  clearData,
  initDefaults,
  ensureDefaults,
  clearOptionsCache,
  _resetForTesting,
} from '../../src/lib/storage.js';

const area = () => chrome.storage.local;

/** Writes records into the old "Bookmarker" IndexedDB, v2 schema. */
async function seedLegacyDb(records) {
  const db = await openDB('Bookmarker', 2, {
    upgrade(d) {
      for (const s of ['credentials', 'options', 'misc', 'hashes']) {
        d.createObjectStore(s, { keyPath: 'item' });
      }
    },
  });
  for (const [store, item, value] of records) {
    await db.put(store, { item, value });
  }
  db.close();
}

async function legacyDbExists() {
  return (await indexedDB.databases()).some((d) => d.name === 'Bookmarker');
}

describe('storage.js', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    _resetForTesting();
    clearOptionsCache();
    await deleteDB('Bookmarker');
    chrome.runtime.sendMessage = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('load_data / store_data / delete_data', () => {
    it('stores under "<store>.<item>" and reads a single value back', async () => {
      await store_data('credentials', { appPassword: 'secret123' });

      expect(area().data['credentials.appPassword']).toBe('secret123');
      expect(await load_data('credentials', 'appPassword')).toBe('secret123');
    });

    it('reads several items as an object in one get', async () => {
      await store_data('credentials', {
        loginname: 'admin',
        server: 'https://example.com',
      });
      area().get.mockClear();

      const result = await load_data('credentials', 'loginname', 'server');

      expect(result).toEqual({
        loginname: 'admin',
        server: 'https://example.com',
      });
      expect(area().get).toHaveBeenCalledTimes(1);
    });

    it('returns undefined for items that were never stored', async () => {
      expect(await load_data('credentials', 'nonexistent')).toBeUndefined();
    });

    it('keeps stores apart', async () => {
      await store_data('options', { server: 'not a credential' });
      expect(await load_data('credentials', 'server')).toBeUndefined();
    });

    it('stores several argument objects in one set', async () => {
      await load_data('options', 'a'); // migration done
      area().set.mockClear();
      await store_data('options', { a: 1 }, { b: 2, c: 3 });

      expect(area().set).toHaveBeenCalledTimes(1);
      expect(await load_data('options', 'a', 'b', 'c')).toEqual({
        a: 1,
        b: 2,
        c: 3,
      });
    });

    it('deletes items', async () => {
      await store_data('options', { a: 1, b: 2 });
      await delete_data('options', 'a');

      expect(await load_data('options', 'a', 'b')).toEqual({
        a: undefined,
        b: 2,
      });
    });

    it('tells the service worker when credentials change', async () => {
      await store_data('credentials', { server: 'https://x' });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'credentialsChanged',
      });
    });

    it('does not reset the worker auth cache when only options change', async () => {
      await store_data('options', { cbx_autoTags: true });
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({
        msg: 'credentialsChanged',
      });
    });
  });

  describe('load_data_all', () => {
    it('returns the records of one store as {item, value}', async () => {
      await store_data('options', { cbx_enableZen: true, cbx_autoTags: false });
      await store_data('credentials', { server: 'https://x' });

      const rows = await load_data_all('options');

      expect(rows).toEqual(
        expect.arrayContaining([
          { item: 'cbx_enableZen', value: true },
          { item: 'cbx_autoTags', value: false },
        ]),
      );
      expect(rows).toHaveLength(2);
    });

    it('returns [] for an empty store', async () => {
      expect(await load_data_all('hashes')).toEqual([]);
    });
  });

  describe('getOption / getOptions', () => {
    it('reads as false when never stored', async () => {
      expect(await getOption('nonexistent')).toBe(false);
      expect(await getOptions(['nonexistent'])).toEqual({ nonexistent: false });
    });

    it('serves repeated reads from the cache', async () => {
      await store_data('options', { cbx_enableZen: true });
      expect(await getOption('cbx_enableZen')).toBe(true);
      area().get.mockClear();

      expect(await getOption('cbx_enableZen')).toBe(true);
      expect(area().get).not.toHaveBeenCalled();
    });

    it('sees a new value right after store_data', async () => {
      await store_data('options', { cbx_enableZen: true });
      await getOption('cbx_enableZen');
      await store_data('options', { cbx_enableZen: false });

      expect(await getOption('cbx_enableZen')).toBe(false);
    });

    it('reads again once the cache entry expired', async () => {
      await store_data('options', { cbx_enableZen: true });
      await getOption('cbx_enableZen');
      // Changed behind the cache's back (e.g. by another context)
      area().data['options.cbx_enableZen'] = false;

      vi.useFakeTimers();
      vi.advanceTimersByTime(31000);
      expect(await getOption('cbx_enableZen')).toBe(false);
    });

    it('fetches only the uncached options, in one get', async () => {
      await store_data('options', { a: 1, b: 2, c: 3 });
      await getOption('a');
      area().get.mockClear();

      expect(await getOptions(['a', 'b', 'c'])).toEqual({ a: 1, b: 2, c: 3 });
      expect(area().get).toHaveBeenCalledTimes(1);
      expect(area().get).toHaveBeenCalledWith(['options.b', 'options.c']);
    });

    it('does not repeat a read that is still in flight', async () => {
      await store_data('options', { a: 'A', b: 'B', c: 'C' });
      area().get.mockClear();

      const [first, second, single] = await Promise.all([
        getOptions(['a', 'b']),
        getOptions(['b', 'c']),
        getOption('a'),
      ]);

      expect(first).toEqual({ a: 'A', b: 'B' });
      expect(second).toEqual({ b: 'B', c: 'C' });
      expect(single).toBe('A');
      expect(area().get).toHaveBeenCalledTimes(2); // [a, b] and [c]
    });

    it('does not keep a failed read', async () => {
      await store_data('options', { a: 'ok' });
      area().get.mockRejectedValueOnce(new Error('read failed'));
      await expect(getOptions(['a'])).rejects.toThrow('read failed');

      await expect(getOptions(['a'])).resolves.toEqual({ a: 'ok' });
    });
  });

  describe('clearData', () => {
    beforeEach(async () => {
      await store_data('credentials', { server: 'https://x', appPassword: 'p' });
      await store_data('options', { cbx_enableZen: true });
      await store_data('misc', { stamp: 1 });
    });

    it('credentials: removes only the credentials', async () => {
      await clearData('credentials');

      expect(await load_data('credentials', 'server')).toBeUndefined();
      expect(await load_data('credentials', 'appPassword')).toBeUndefined();
      expect(await load_data('options', 'cbx_enableZen')).toBe(true);
      expect(await load_data('misc', 'stamp')).toBe(1);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'credentialsChanged',
      });
    });

    it('options: restores the defaults and keeps the login', async () => {
      await clearData('options');

      expect(await load_data('options', 'cbx_enableZen')).toBe(false);
      expect(await load_data('options', 'cbx_showUrl')).toBe(true);
      expect(await load_data('credentials', 'server')).toBe('https://x');
    });

    it('all: removes everything, then restores the default options', async () => {
      await clearData('all');

      expect(await load_data('credentials', 'server')).toBeUndefined();
      expect(await load_data('misc', 'stamp')).toBeUndefined();
      expect(await load_data('options', 'cbx_showUrl')).toBe(true);
    });

    it('does not fail when no service worker is listening', async () => {
      chrome.runtime.sendMessage = vi
        .fn()
        .mockRejectedValue(new Error('no receiver'));
      await expect(clearData('credentials')).resolves.toBeUndefined();
    });

    it('cache: empties the cache database stores', async () => {
      const { cacheDbVersion, initCacheStores } = await import(
        '../../src/lib/cacheSchema.js'
      );
      const db = await openDB('BookmarkerCache', cacheDbVersion, {
        upgrade: initCacheStores,
      });
      for (const store of ['folders', 'keywords', 'bookmarkChecks']) {
        await db.put(store, { item: 'k', value: 1 });
      }
      db.close();

      await clearData('cache');

      const after = await openDB('BookmarkerCache', cacheDbVersion);
      for (const store of ['folders', 'keywords', 'bookmarkChecks']) {
        expect(await after.count(store)).toBe(0);
      }
      after.close();
      // Login untouched
      expect(await load_data('credentials', 'server')).toBe('https://x');
    });
  });

  describe('defaults', () => {
    it('initDefaults writes every default option', async () => {
      await initDefaults();

      expect(await load_data('options', 'cbx_showUrl')).toBe(true);
      expect(await load_data('options', 'cbx_enableZen')).toBe(false);
      expect(await load_data('options', 'input_networkTimeout')).toBe(10);
    });

    it('ensureDefaults adds only missing options and keeps existing values', async () => {
      await store_data('options', { cbx_showUrl: false });

      await ensureDefaults();

      expect(await load_data('options', 'cbx_showUrl')).toBe(false);
      expect(await load_data('options', 'cbx_fuzzyUrlMatch')).toBe(true);
      expect(await load_data('options', 'input_titleCheckLimit')).toBe(20);
    });

    it('ensureDefaults writes nothing when every default is present', async () => {
      await initDefaults();
      area().set.mockClear();

      await ensureDefaults();

      expect(area().set).not.toHaveBeenCalled();
    });
  });

  describe('migration from the old IndexedDB', () => {
    it('moves credentials and options over and deletes the old database', async () => {
      await seedLegacyDb([
        ['credentials', 'server', 'https://cloud.example'],
        ['credentials', 'loginname', 'alice'],
        ['credentials', 'appPassword', 'app-pw'],
        ['options', 'cbx_enableZen', true],
        ['misc', 'lastConnectionWarmup', 42],
      ]);

      expect(
        await load_data('credentials', 'server', 'loginname', 'appPassword'),
      ).toEqual({
        server: 'https://cloud.example',
        loginname: 'alice',
        appPassword: 'app-pw',
      });
      expect(await getOption('cbx_enableZen')).toBe(true);
      expect(await load_data('misc', 'lastConnectionWarmup')).toBe(42);
      // No second copy of the app password left in site data
      expect(await legacyDbExists()).toBe(false);
    });

    it('renames the v1 option cbx_autoDesc', async () => {
      await seedLegacyDb([['options', 'cbx_autoDesc', false]]);

      expect(await load_data('options', 'cbx_autoDescription')).toBe(false);
      expect(await load_data('options', 'cbx_autoDesc')).toBeUndefined();
    });

    it('runs only once', async () => {
      await seedLegacyDb([['credentials', 'server', 'https://old']]);
      await load_data('credentials', 'server');
      await clearData('credentials');

      // Even if an old database turned up again, it is not read a second time
      await seedLegacyDb([['credentials', 'server', 'https://old']]);
      _resetForTesting(); // e.g. a new service worker
      expect(await load_data('credentials', 'server')).toBeUndefined();
    });

    it('does not overwrite values already in chrome.storage.local', async () => {
      area().data['credentials.server'] = 'https://new';
      await seedLegacyDb([['credentials', 'server', 'https://old']]);

      expect(await load_data('credentials', 'server')).toBe('https://new');
    });

    it('fresh install: nothing to move, ensureDefaults supplies the options', async () => {
      expect(await load_data('credentials', 'server')).toBeUndefined();
      await ensureDefaults();

      expect(await getOption('cbx_showUrl')).toBe(true);
      expect(await legacyDbExists()).toBe(false);
    });

    it('keeps working and retries later if the old database cannot be read', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
        throw new Error('blocked');
      });

      await store_data('options', { a: 1 });
      expect(await load_data('options', 'a')).toBe(1);
      expect(area().data['storage.migrated']).toBeUndefined();

      open.mockRestore();
      await seedLegacyDb([['credentials', 'server', 'https://old']]);
      _resetForTesting();
      expect(await load_data('credentials', 'server')).toBe('https://old');
    });
  });
});
