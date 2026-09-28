// @vitest-environment node
/**
 * Unit tests for storage.js
 * Tests IndexedDB operations, caching, and storage utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDB, deleteDB } from 'idb';

// Mock idb module
vi.mock('idb', () => ({
  openDB: vi.fn(),
  deleteDB: vi.fn(),
}));

// Import after mocking
import {
  load_data,
  load_data_all,
  store_data,
  delete_data,
  store_hash,
  getOption,
  getOptions,
  clearData,
  initDatabase,
  initDefaults,
  ensureDefaults,
  createOldDatabase,
  clearOptionsCache,
  _resetMainConnectionForTesting,
} from '../src/lib/storage.js';

describe('storage.js', () => {
  let mockDB;
  let mockTransaction;
  let mockStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers(); // Ensure fake timers never leak between tests
    vi.resetModules();

    // Reset the connection pool so each test gets a fresh openDB call
    _resetMainConnectionForTesting();

    // Clear the options cache before each test
    clearOptionsCache();

    // Create mock store
    mockStore = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      getAll: vi.fn(),
    };

    // Create mock transaction
    mockTransaction = {
      objectStore: vi.fn(() => mockStore),
    };

    // Create mock DB
    mockDB = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      getAll: vi.fn(),
      close: vi.fn(),
      objectStoreNames: { contains: vi.fn(() => true) },
    };

    // Mock openDB to return our mock DB
    openDB.mockResolvedValue(mockDB);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('load_data', () => {
    it('should load single item from store', async () => {
      mockDB.get.mockResolvedValue({ item: 'appPassword', value: 'secret123' });

      const result = await load_data('credentials', 'appPassword');

      expect(mockDB.get).toHaveBeenCalledWith('credentials', 'appPassword');
      expect(result).toBe('secret123');
    });

    it('should load multiple items from store', async () => {
      mockDB.get
        .mockResolvedValueOnce({ item: 'loginname', value: 'admin' })
        .mockResolvedValueOnce({
          item: 'server',
          value: 'https://example.com',
        });

      const result = await load_data('credentials', 'loginname', 'server');

      expect(result).toEqual({
        loginname: 'admin',
        server: 'https://example.com',
      });
    });

    it('should return undefined for non-existent items', async () => {
      mockDB.get.mockResolvedValue(undefined);

      const result = await load_data('credentials', 'nonexistent');

      expect(result).toBe(undefined);
    });

    it('should handle DB errors gracefully', async () => {
      // Mock get to return a rejected promise with .catch() method
      const rejectedPromise = Promise.reject(new Error('DB error'));
      rejectedPromise.catch(() => {}); // Add catch handler to prevent unhandled rejection
      mockDB.get.mockReturnValue(rejectedPromise);

      // Note: The actual code uses .catch() on the promise
      // When the mock returns a promise with .catch(), the error is caught
      // and the function returns undefined (result[item] = undefined)
      const result = await load_data('credentials', 'appPassword');
      expect(result).toBe(undefined);
    });

    it('should return single value when only one item requested', async () => {
      mockDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: true });

      const result = await load_data('options', 'cbx_enableZen');

      expect(result).toBe(true);
    });
  });

  describe('load_data_all', () => {
    it('should load all items from store', async () => {
      const mockData = [
        { item: 'cbx_enableZen', value: true },
        { item: 'cbx_autoTags', value: false },
      ];
      mockDB.getAll.mockResolvedValue(mockData);

      const result = await load_data_all('options');

      expect(mockDB.getAll).toHaveBeenCalledWith('options');
      expect(result).toEqual(mockData);
    });

    it('should handle empty store', async () => {
      mockDB.getAll.mockResolvedValue([]);

      const result = await load_data_all('options');

      expect(result).toEqual([]);
    });

    it('should handle DB errors gracefully', async () => {
      mockDB.getAll.mockRejectedValue(new Error('DB error'));

      // Used to reject with a ReferenceError: the catch fallback referenced
      // `result` inside its own initialiser. It now falls back to no rows.
      await expect(load_data_all('options')).resolves.toEqual([]);
    });
  });

  describe('store_data', () => {
    it('should store single item', async () => {
      await store_data('options', { cbx_enableZen: true });

      expect(mockDB.put).toHaveBeenCalledWith('options', {
        item: 'cbx_enableZen',
        value: true,
      });
    });

    it('should store multiple items', async () => {
      await store_data(
        'options',
        { cbx_enableZen: true },
        { cbx_autoTags: false },
      );

      expect(mockDB.put).toHaveBeenCalledTimes(2);
      expect(mockDB.put).toHaveBeenCalledWith('options', {
        item: 'cbx_enableZen',
        value: true,
      });
      expect(mockDB.put).toHaveBeenCalledWith('options', {
        item: 'cbx_autoTags',
        value: false,
      });
    });

    it('should store multiple properties in one object', async () => {
      await store_data('options', { cbx_enableZen: true, cbx_autoTags: false });

      expect(mockDB.put).toHaveBeenCalledTimes(2);
    });

    it('should clear options cache when storing options', async () => {
      // First, populate cache
      mockDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: true });
      await getOption('cbx_enableZen');

      // Now store new data
      mockDB.put.mockResolvedValue(undefined);
      await store_data('options', { cbx_enableZen: false });

      // Cache should be cleared, so next getOption should fetch from DB
      mockDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: false });
      const result = await getOption('cbx_enableZen');

      expect(result).toBe(false);
    });

    it('should await db.put before returning', async () => {
      let putResolved = false;
      mockDB.put.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              putResolved = true;
              resolve();
            }, 10),
          ),
      );

      await store_data('options', { cbx_enableZen: true });

      expect(putResolved).toBe(true);
    });
  });

  describe('delete_data', () => {
    it('should delete single item', async () => {
      mockDB.delete.mockResolvedValue(undefined);

      await delete_data('credentials', 'appPassword');

      expect(mockDB.delete).toHaveBeenCalledWith('credentials', 'appPassword');
    });

    it('should delete multiple items', async () => {
      // Note: The actual code calls db.delete().catch(), but the mock doesn't
      // return a promise, causing a TypeError. We need to mock delete to return
      // a promise with a catch method.
      mockDB.delete.mockImplementation(() => Promise.resolve());

      await delete_data('options', 'option1', 'option2');

      expect(mockDB.delete).toHaveBeenCalledTimes(2);
      expect(mockDB.delete).toHaveBeenCalledWith('options', 'option1');
      expect(mockDB.delete).toHaveBeenCalledWith('options', 'option2');
    });

    it('should handle DB errors gracefully', async () => {
      mockDB.delete.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(delete_data('options', 'test')).resolves.not.toThrow();
    });

    it('should await db.delete before returning', async () => {
      let deleteResolved = false;
      mockDB.delete.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              deleteResolved = true;
              resolve();
            }, 10),
          ),
      );

      await delete_data('credentials', 'appPassword');

      expect(deleteResolved).toBe(true);
    });
  });

  describe('store_hash', () => {
    it('should store hash with timestamp', async () => {
      const mockDate = 1234567890000;
      vi.spyOn(Date, 'now').mockReturnValue(mockDate);

      await store_hash('test-hash');

      expect(mockDB.put).toHaveBeenCalledWith('hashes', {
        item: 'test-hash',
        value: mockDate,
      });

      vi.restoreAllMocks();
    });

    it('should await db.put before returning', async () => {
      let putResolved = false;
      mockDB.put.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              putResolved = true;
              resolve();
            }, 10),
          ),
      );

      await store_hash('test-hash');

      expect(putResolved).toBe(true);
    });
  });

  describe('getOption', () => {
    it('should return cached value if available', async () => {
      // First call - cache miss
      mockDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: true });
      const result1 = await getOption('cbx_enableZen');
      expect(result1).toBe(true);

      // Second call - cache hit
      mockDB.get.mockClear();
      const result2 = await getOption('cbx_enableZen');
      expect(result2).toBe(true);
      expect(mockDB.get).not.toHaveBeenCalled();
    });

    it('should return false for undefined options', async () => {
      mockDB.get.mockResolvedValue(undefined);

      const result = await getOption('nonexistent');

      expect(result).toBe(false);
    });

    it('should fetch from DB when cache expires', async () => {
      vi.useFakeTimers();

      // First call - cache miss
      mockDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: true });
      const result1 = await getOption('cbx_enableZen');
      expect(result1).toBe(true);

      // Advance time past TTL (30 seconds)
      vi.advanceTimersByTime(31000);

      // Second call - cache expired, should fetch from DB
      mockDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: false });
      const result2 = await getOption('cbx_enableZen');
      expect(result2).toBe(false);
      expect(mockDB.get).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('getOptions', () => {
    it('should batch fetch multiple options', async () => {
      mockDB.get
        .mockResolvedValueOnce({ item: 'cbx_enableZen', value: true })
        .mockResolvedValueOnce({ item: 'cbx_autoTags', value: false });

      const result = await getOptions(['cbx_enableZen', 'cbx_autoTags']);

      expect(result).toEqual({
        cbx_enableZen: true,
        cbx_autoTags: false,
      });
      expect(mockDB.get).toHaveBeenCalledTimes(2);
    });

    it('should use cache for some options and fetch others', async () => {
      // First, populate cache for one option
      mockDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: true });
      await getOption('cbx_enableZen');

      // Now fetch multiple options - one cached, one not
      mockDB.get.mockClear();
      mockDB.get.mockResolvedValue({ item: 'cbx_autoTags', value: false });

      const result = await getOptions(['cbx_enableZen', 'cbx_autoTags']);

      expect(result).toEqual({
        cbx_enableZen: true,
        cbx_autoTags: false,
      });
      // Should only fetch the uncached option
      expect(mockDB.get).toHaveBeenCalledTimes(1);
    });

    it('should return false for undefined options in batch', async () => {
      mockDB.get.mockResolvedValue(undefined);

      const result = await getOptions(['nonexistent']);

      expect(result).toEqual({ nonexistent: false });
    });

    it('should not repeat a read that is still in flight', async () => {
      mockDB.get.mockImplementation((store, name) =>
        Promise.resolve({ item: name, value: `${name}-value` }),
      );

      // Second call starts before the first has resolved (empty cache)
      const [first, second] = await Promise.all([
        getOptions(['a', 'b']),
        getOptions(['b', 'c']),
      ]);

      expect(first).toEqual({ a: 'a-value', b: 'b-value' });
      expect(second).toEqual({ b: 'b-value', c: 'c-value' });
      // a, b, c -- b is read once
      expect(mockDB.get).toHaveBeenCalledTimes(3);
    });

    it('should let getOption join an in-flight getOptions read', async () => {
      mockDB.get.mockResolvedValue({ item: 'a', value: 'a-value' });

      const [batch, single] = await Promise.all([
        getOptions(['a']),
        getOption('a'),
      ]);

      expect(batch).toEqual({ a: 'a-value' });
      expect(single).toBe('a-value');
      expect(mockDB.get).toHaveBeenCalledTimes(1);
    });

    it('should not join a failed read afterwards', async () => {
      openDB.mockRejectedValueOnce(new Error('open failed'));
      await expect(getOptions(['a'])).rejects.toThrow('open failed');

      // A failed open must not poison the pool: the retry opens again
      openDB.mockResolvedValue(mockDB);
      mockDB.get.mockResolvedValue({ item: 'a', value: 'ok' });
      await expect(getOptions(['a'])).resolves.toEqual({ a: 'ok' });
    });
  });

  describe('clearData', () => {
    it('should clear all data', async () => {
      await clearData('all');

      expect(mockDB.clear).toHaveBeenCalledWith('credentials');
      expect(mockDB.clear).toHaveBeenCalledWith('options');
      expect(mockDB.clear).toHaveBeenCalledWith('misc');
      expect(mockDB.clear).toHaveBeenCalledWith('hashes');
    });

    it('should clear only options', async () => {
      await clearData('options');
      expect(mockDB.clear).toHaveBeenCalledWith('options');
    });

    it('should clear only credentials', async () => {
      await clearData('credentials');
      expect(mockDB.clear).toHaveBeenCalledWith('credentials');
    });

    it('should clear cache', async () => {
      // Mock cache DB - needs objectStoreNames for validation
      const mockCacheDB = {
        clear: vi.fn(),
        close: vi.fn(),
        objectStoreNames: { contains: vi.fn(() => true) },
      };
      openDB.mockResolvedValue(mockCacheDB);

      await clearData('cache');

      expect(mockCacheDB.clear).toHaveBeenCalledWith('folders');
      expect(mockCacheDB.clear).toHaveBeenCalledWith('keywords');
    });

    it('should also clear stale bookmark check results and close the cache connection', async () => {
      const mockCacheDB = { clear: vi.fn(), close: vi.fn() };
      openDB.mockResolvedValue(mockCacheDB);

      await clearData('cache');

      expect(mockCacheDB.clear).toHaveBeenCalledWith('bookmarkChecks');
      expect(mockCacheDB.close).toHaveBeenCalled();
    });

    it('should not resolve before the clears have finished', async () => {
      let cleared = false;
      mockDB.clear.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              cleared = true;
              resolve();
            }, 10),
          ),
      );

      await clearData('credentials');

      expect(cleared).toBe(true);
    });

    it('should restore the defaults after clearing options, once the clear is done', async () => {
      const order = [];
      mockDB.clear.mockImplementation(async () => order.push('clear'));
      mockDB.put.mockImplementation(async () => order.push('put'));

      await clearData('options');

      // Otherwise every option would read back as false until the next restart.
      expect(order[0]).toBe('clear');
      expect(order.filter((o) => o === 'put').length).toBeGreaterThan(10);
    });

    it('should tell the service worker to drop its cached credentials', async () => {
      globalThis.chrome = { runtime: { sendMessage: vi.fn() } };
      try {
        await clearData('credentials');

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          msg: 'credentialsChanged',
        });
      } finally {
        delete globalThis.chrome;
      }
    });

    it('should not fail when no service worker is listening', async () => {
      globalThis.chrome = {
        runtime: { sendMessage: vi.fn().mockRejectedValue(new Error('none')) },
      };
      try {
        await expect(clearData('credentials')).resolves.toBeUndefined();
      } finally {
        delete globalThis.chrome;
      }
    });
  });

  describe('ensureDefaults', () => {
    it('should add only the options that are missing and keep existing values', async () => {
      mockDB.getAllKeys = vi.fn().mockResolvedValue(['cbx_showUrl']);
      mockDB.put.mockResolvedValue(undefined);

      await ensureDefaults();

      const written = mockDB.put.mock.calls.map(([, entry]) => entry.item);
      expect(written).not.toContain('cbx_showUrl');
      expect(written).toContain('cbx_fuzzyUrlMatch');
      expect(written).toContain('input_titleCheckLimit');
    });

    it('should write nothing when every default is present', async () => {
      const { initDefaults: init } = await import('../src/lib/storage.js');
      mockDB.put.mockResolvedValue(undefined);
      await init();
      const allKeys = mockDB.put.mock.calls.map(([, entry]) => entry.item);
      mockDB.put.mockClear();
      mockDB.getAllKeys = vi.fn().mockResolvedValue(allKeys);

      await ensureDefaults();

      expect(mockDB.put).not.toHaveBeenCalled();
    });
  });

  describe('initDefaults', () => {
    it('should store all default options', async () => {
      mockDB.put.mockResolvedValue(undefined);

      initDefaults();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that default options are stored
      expect(mockDB.put).toHaveBeenCalledWith('options', {
        item: 'cbx_showUrl',
        value: true,
      });
      expect(mockDB.put).toHaveBeenCalledWith('options', {
        item: 'cbx_enableZen',
        value: false,
      });
      expect(mockDB.put).toHaveBeenCalledWith('options', {
        item: 'input_networkTimeout',
        value: 10,
      });
    });
  });

  describe('initDatabase', () => {
    it('should initialize stores on fresh install', async () => {
      const mockCreateObjectStore = vi.fn();
      const mockDb = {
        createObjectStore: mockCreateObjectStore,
      };

      await initDatabase(mockDb, 0); // version 0 = fresh install

      expect(mockCreateObjectStore).toHaveBeenCalledWith('credentials', {
        keyPath: 'item',
      });
      expect(mockCreateObjectStore).toHaveBeenCalledWith('options', {
        keyPath: 'item',
      });
    });

    it('should handle version upgrade from v1 to v2', async () => {
      const mockCreateObjectStore = vi.fn();
      const mockDb = {
        createObjectStore: mockCreateObjectStore,
      };

      // Mock load_data to return values for the migration
      // The migration code calls load_data for old options
      mockDB.get
        .mockResolvedValueOnce({ item: 'cbx_autoDesc', value: true })
        .mockResolvedValueOnce({ item: 'cbx_autoTags', value: true })
        .mockResolvedValueOnce({ item: 'cbx_displayFolders', value: true });

      // Mock store_data and delete_data to not throw
      mockDB.put.mockResolvedValue(undefined);
      mockDB.delete.mockResolvedValue(undefined);

      await initDatabase(mockDb, 1);

      // The migration path should be triggered
      // Verify that store_data was called for the migrated options
      expect(mockDB.put).toHaveBeenCalled();
    });
  });

  describe('createOldDatabase', () => {
    it('should create version 1 database', async () => {
      const mockDb = {
        put: vi.fn(),
      };
      const mockCacheDb = {
        createObjectStore: vi.fn(),
      };

      // Mock deleteDB to return a resolved promise
      deleteDB.mockResolvedValue(undefined);

      // Mock openDB to return different mock DBs based on database name
      // The function calls openDB twice - once for Bookmarker (awaited), once for Cache (not awaited)
      openDB.mockImplementation((dbName, version, options) => {
        if (dbName === 'Bookmarker') {
          return Promise.resolve(mockDb);
        }
        if (dbName === 'Cache') {
          return Promise.resolve(mockCacheDb);
        }
        return Promise.resolve(mockDb);
      });

      // Call the function with version as number (the function checks version === 1)
      await createOldDatabase(1);

      // Check deleteDB calls first - should be called twice
      expect(deleteDB).toHaveBeenCalledTimes(2);
      expect(deleteDB).toHaveBeenCalledWith('Bookmarker');
      expect(deleteDB).toHaveBeenCalledWith('Cache');

      // Check openDB calls
      expect(openDB).toHaveBeenCalledWith('Bookmarker', 1, expect.any(Object));
      expect(openDB).toHaveBeenCalledWith('Cache', 2, expect.any(Object));

      // Check that put was called on the mock DB
      expect(mockDb.put).toHaveBeenCalledWith('credentials', {
        item: 'appPassword',
        value: 'ThisistheApppassword',
      });
    });
  });

  describe('clearOptionsCache', () => {
    it('should clear the options cache', async () => {
      // Populate cache - need to mock openDB for getOption
      const mockCacheDB = {
        get: vi.fn(),
        put: vi.fn(),
        close: vi.fn(),
        objectStoreNames: { contains: vi.fn(() => true) },
      };
      openDB.mockResolvedValue(mockCacheDB);
      mockCacheDB.get.mockResolvedValue({ item: 'cbx_enableZen', value: true });

      await getOption('cbx_enableZen');

      // Clear cache
      clearOptionsCache();

      // Cache should be cleared, so next getOption should fetch from DB
      mockCacheDB.get.mockResolvedValue({
        item: 'cbx_enableZen',
        value: false,
      });
      const result = await getOption('cbx_enableZen');

      expect(result).toBe(false);
      expect(mockCacheDB.get).toHaveBeenCalled();
    });
  });
});
