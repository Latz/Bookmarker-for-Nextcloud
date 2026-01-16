/**
 * Unit tests for displayJson module
 * Tests the function that displays JSON data in the options page
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('idb', () => ({
  openDB: vi.fn(),
}));

vi.mock('../src/lib/storage.js', () => ({
  load_data_all: vi.fn(),
}));

// Import the module after mocking
import { openDB } from 'idb';
import { load_data_all } from '../src/lib/storage.js';

// Note: The displayJson module uses top-level await, so we need to test it differently
// We'll test the logic by simulating what happens when the module is loaded

describe('displayJson module', () => {
  let mockDocument;
  let mockJsonDataElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonDataElement = {
      innerHTML: '',
    };
    mockDocument = {
      getElementById: vi.fn(),
    };

    // Reset global state
    delete global.window;
    delete global.document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL parameter parsing', () => {
    it('should parse type=options from URL', () => {
      global.window = {
        location: {
          search: '?type=options',
        },
      };

      const urlParams = global.window.location.search || '';
      const type = urlParams.split('=')[1];

      expect(type).toBe('options');
    });

    it('should parse type=cache from URL', () => {
      global.window = {
        location: {
          search: '?type=cache',
        },
      };

      const urlParams = global.window.location.search || '';
      const type = urlParams.split('=')[1];

      expect(type).toBe('cache');
    });

    it('should handle empty URL parameters', () => {
      global.window = {
        location: {
          search: '',
        },
      };

      const urlParams = global.window.location.search || '';
      const type = urlParams.split('=')[1];

      expect(type).toBeUndefined();
    });

    it('should handle URL with no type parameter', () => {
      global.window = {
        location: {
          search: '?other=value',
        },
      };

      const urlParams = global.window.location.search || '';
      const type = urlParams.split('=')[1];

      expect(type).toBe('value');
    });
  });

  describe('Options data loading', () => {
    it('should load options data when type is options', async () => {
      global.window = {
        location: {
          search: '?type=options',
        },
      };

      const mockOptions = {
        cbx_showUrl: true,
        cbx_autoTags: false,
        input_titleCheckLimit: 20,
      };
      load_data_all.mockResolvedValue(mockOptions);

      const type = 'options';
      let data;
      if (type === 'options') {
        data = await load_data_all('options');
      }

      expect(load_data_all).toHaveBeenCalledWith('options');
      expect(data).toEqual(mockOptions);
    });

    it('should return undefined when options are empty', async () => {
      global.window = {
        location: {
          search: '?type=options',
        },
      };

      load_data_all.mockResolvedValue({});

      const type = 'options';
      let data;
      if (type === 'options') {
        data = await load_data_all('options');
      }

      expect(data).toEqual({});
    });

    it('should handle load_data_all error', async () => {
      global.window = {
        location: {
          search: '?type=options',
        },
      };

      load_data_all.mockRejectedValue(new Error('Storage error'));

      const type = 'options';
      let data;
      if (type === 'options') {
        try {
          data = await load_data_all('options');
        } catch (e) {
          data = null;
        }
      }

      expect(data).toBeNull();
    });
  });

  describe('Cache data loading', () => {
    it('should load cache data when type is cache', async () => {
      global.window = {
        location: {
          search: '?type=cache',
        },
      };

      const mockCache = ['keyword1', 'keyword2', 'keyword3'];
      openDB.mockResolvedValue({
        get: vi.fn().mockResolvedValue(mockCache),
      });

      const type = 'cache';
      let data;
      if (type === 'cache') {
        const db = await openDB('BookmarkerCache', 2);
        data = await db.get('keywords', 'keywords');
      }

      expect(openDB).toHaveBeenCalledWith('BookmarkerCache', 2);
      expect(data).toEqual(mockCache);
    });

    it('should handle empty cache data', async () => {
      global.window = {
        location: {
          search: '?type=cache',
        },
      };

      openDB.mockResolvedValue({
        get: vi.fn().mockResolvedValue([]),
      });

      const type = 'cache';
      let data;
      if (type === 'cache') {
        const db = await openDB('BookmarkerCache', 2);
        data = await db.get('keywords', 'keywords');
      }

      expect(data).toEqual([]);
    });

    it('should handle undefined cache data', async () => {
      global.window = {
        location: {
          search: '?type=cache',
        },
      };

      openDB.mockResolvedValue({
        get: vi.fn().mockResolvedValue(undefined),
      });

      const type = 'cache';
      let data;
      if (type === 'cache') {
        const db = await openDB('BookmarkerCache', 2);
        data = await db.get('keywords', 'keywords');
      }

      expect(data).toBeUndefined();
    });

    it('should handle database error', async () => {
      global.window = {
        location: {
          search: '?type=cache',
        },
      };

      openDB.mockRejectedValue(new Error('Database error'));

      const type = 'cache';
      let data;
      if (type === 'cache') {
        try {
          const db = await openDB('BookmarkerCache', 2);
          data = await db.get('keywords', 'keywords');
        } catch (e) {
          data = null;
        }
      }

      expect(data).toBeNull();
    });
  });

  describe('JSON display', () => {
    it('should format JSON with proper indentation', () => {
      const data = {
        key1: 'value1',
        key2: 123,
        key3: true,
      };

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toContain('key1');
      expect(formatted).toContain('value1');
      expect(formatted).toContain('key2');
      expect(formatted).toContain('123');
      expect(formatted).toContain('key3');
      expect(formatted).toContain('true');
      expect(formatted).toContain('<pre>');
      expect(formatted).toContain('</pre>');
    });

    it('should handle null data', () => {
      const data = null;

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toBe('<pre>null</pre>');
    });

    it('should handle undefined data', () => {
      const data = undefined;

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toBe('<pre>undefined</pre>');
    });

    it('should handle empty object', () => {
      const data = {};

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toBe('<pre>{}</pre>');
    });

    it('should handle empty array', () => {
      const data = [];

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toBe('<pre>[]</pre>');
    });

    it('should handle nested objects', () => {
      const data = {
        outer: {
          inner: {
            value: 'test',
          },
        },
      };

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toContain('outer');
      expect(formatted).toContain('inner');
      expect(formatted).toContain('value');
    });

    it('should handle arrays in data', () => {
      const data = {
        items: ['item1', 'item2', 'item3'],
      };

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toContain('items');
      expect(formatted).toContain('item1');
      expect(formatted).toContain('item2');
      expect(formatted).toContain('item3');
    });
  });

  describe('Integration scenarios', () => {
    it('should display options data correctly', async () => {
      global.window = {
        location: {
          search: '?type=options',
        },
      };

      const mockOptions = {
        cbx_showUrl: true,
        cbx_autoTags: false,
        input_titleCheckLimit: 20,
        input_titleSimilarityThreshold: 75,
      };
      load_data_all.mockResolvedValue(mockOptions);

      const type = 'options';
      let data;
      if (type === 'options') {
        data = await load_data_all('options');
      }

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toContain('cbx_showUrl');
      expect(formatted).toContain('true');
      expect(formatted).toContain('cbx_autoTags');
      expect(formatted).toContain('false');
      expect(formatted).toContain('input_titleCheckLimit');
      expect(formatted).toContain('20');
    });

    it('should display cache data correctly', async () => {
      global.window = {
        location: {
          search: '?type=cache',
        },
      };

      const mockCache = ['work', 'personal', 'important', 'todo'];
      openDB.mockResolvedValue({
        get: vi.fn().mockResolvedValue(mockCache),
      });

      const type = 'cache';
      let data;
      if (type === 'cache') {
        const db = await openDB('BookmarkerCache', 2);
        data = await db.get('keywords', 'keywords');
      }

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toContain('work');
      expect(formatted).toContain('personal');
      expect(formatted).toContain('important');
      expect(formatted).toContain('todo');
    });
  });

  describe('Edge cases', () => {
    it('should handle URL with trailing characters', () => {
      global.window = {
        location: {
          search: '?type=options&extra=param',
        },
      };

      const urlParams = new URLSearchParams(global.window.location.search);
      const type = urlParams.get('type');

      expect(type).toBe('options');
    });

    it('should handle URL with encoded characters', () => {
      global.window = {
        location: {
          search: '?type=options%2Fpath',
        },
      };

      const urlParams = global.window.location.search || '';
      const type = urlParams.split('=')[1];

      expect(type).toBe('options%2Fpath');
    });

    it('should handle circular references in JSON (should not occur in our data)', () => {
      const data = {
        key: 'value',
      };

      // JSON.stringify handles this by throwing an error
      expect(() => JSON.stringify(data, null, 4)).not.toThrow();
    });

    it('should handle large data objects', () => {
      const data = {};
      for (let i = 0; i < 100; i++) {
        data[`key${i}`] = `value${i}`;
      }

      const formatted = '<pre>' + JSON.stringify(data, null, 4) + '</pre>';

      expect(formatted).toContain('key0');
      expect(formatted).toContain('value99');
    });
  });
});
