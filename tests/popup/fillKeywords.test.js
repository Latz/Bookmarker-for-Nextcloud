/**
 * Unit tests for fillKeywords module
 * Tests the function that populates keyword input with Tagify
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies - hoisted to top of file
vi.mock('../../src/lib/cache.js', () => ({
  cacheGet: vi.fn(),
}));

// Mock Tagify with factory that stores mocks in global storage
// Note: vi.mock() is hoisted, so we can't use local variables
vi.mock('@yaireo/tagify', () => {
  const mockAddTags = vi.fn();
  const mockRemoveAllTags = vi.fn();
  // DOM events the user causes in the field, keyed by event name
  const scopeListeners = {};
  const mockTagifyConstructor = vi.fn(function () {
    return {
      addTags: mockAddTags,
      removeAllTags: mockRemoveAllTags,
      on: vi.fn(),
      whitelist: [],
      DOM: {
        scope: {
          addEventListener: vi.fn((name, callback) => {
            scopeListeners[name] = callback;
          }),
        },
      },
    };
  });

  // Store references on global object for tests to access
  // eslint-disable-next-line no-undef
  globalThis.__mockAddTags = mockAddTags;
  // eslint-disable-next-line no-undef
  globalThis.__mockRemoveAllTags = mockRemoveAllTags;
  // eslint-disable-next-line no-undef
  globalThis.__mockScopeListeners = scopeListeners;
  // eslint-disable-next-line no-undef
  globalThis.__mockTagifyConstructor = mockTagifyConstructor;

  return {
    default: mockTagifyConstructor,
  };
});

// Import the module after mocking.
// The Tagify import is deliberate even though this file never references the
// binding: fillKeywords now loads Tagify via dynamic import, so without an
// eager import here the vi.mock factory above would not run until the first
// fillKeywords() call -- leaving the globals it publishes undefined in
// beforeEach.
import '@yaireo/tagify';
import fillKeywords, {
  preloadKeywordAssets,
  replaceKeywords,
} from '../../src/popup/modules/fillKeywords.js';
import { cacheGet } from '../../src/lib/cache.js';

describe('fillKeywords', () => {
  let mockTagsInput;
  let mockTagifyConstructor;
  let mockAddTags;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get the mock constructor from global storage
    mockTagifyConstructor = globalThis.__mockTagifyConstructor;
    mockAddTags = globalThis.__mockAddTags;

    mockTagsInput = {
      classList: {
        remove: vi.fn(),
      },
    };

    // Reset mock implementations
    mockAddTags.mockClear();
    mockTagifyConstructor.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DOM element handling', () => {
    it('should get keywords input element by ID', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(document.getElementById).toHaveBeenCalledWith('keywords');
    });

    it('should remove input-sm and input classes from input', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagsInput.classList.remove).toHaveBeenCalledWith(
        'input-sm',
        'input',
      );
    });
  });

  describe('Tagify initialization', () => {
    it('should initialize Tagify with correct configuration', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = ['tag1', 'tag2', 'tag3'];
      cacheGet.mockResolvedValue(cachedTags);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(mockTagsInput, {
        whitelist: cachedTags,
        backspace: 'edit',
        dropdown: {
          maxItems: 5,
          highlightFirst: true,
          includeSelectedTags: true,
        },
      });
    });

    it('should handle empty cached tags array', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(mockTagsInput, {
        whitelist: [],
        backspace: 'edit',
        dropdown: {
          maxItems: 5,
          highlightFirst: true,
          includeSelectedTags: true,
        },
      });
    });

    it('should handle cacheGet returning non-array value', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue('not an array');

      await fillKeywords(['keyword1']);

      // The code checks if constructor !== Array, so it should convert to empty array
      expect(mockTagifyConstructor).toHaveBeenCalledWith(mockTagsInput, {
        whitelist: [],
        backspace: 'edit',
        dropdown: {
          maxItems: 5,
          highlightFirst: true,
          includeSelectedTags: true,
        },
      });
    });

    it('should handle cacheGet returning object', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue({ key: 'value' });

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(mockTagsInput, {
        whitelist: [],
        backspace: 'edit',
        dropdown: {
          maxItems: 5,
          highlightFirst: true,
          includeSelectedTags: true,
        },
      });
    });
  });

  describe('Keyword addition', () => {
    it('should add keywords when provided', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      const keywords = ['keyword1', 'keyword2', 'keyword3'];
      await fillKeywords(keywords);

      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should not add keywords when array is empty', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords([]);

      expect(mockAddTags).not.toHaveBeenCalled();
    });

    it('should not add keywords when keywords is undefined', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(undefined);

      expect(mockAddTags).not.toHaveBeenCalled();
    });

    it('should not add keywords when keywords is null', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(null);

      expect(mockAddTags).not.toHaveBeenCalled();
    });

    it('should handle single keyword string', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords('singleKeyword');

      expect(mockAddTags).toHaveBeenCalledWith('singleKeyword');
    });
  });

  describe('Real-world scenarios', () => {
    it('should work with typical cached tags from Nextcloud', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = ['work', 'personal', 'important', 'todo', 'reading'];
      cacheGet.mockResolvedValue(cachedTags);

      const keywords = ['work', 'important'];
      await fillKeywords(keywords);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.objectContaining({
          whitelist: cachedTags,
        }),
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should handle large number of cached tags', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
      cacheGet.mockResolvedValue(cachedTags);

      const keywords = ['tag10', 'tag20', 'tag30'];
      await fillKeywords(keywords);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.objectContaining({
          whitelist: cachedTags,
        }),
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should handle special characters in tags', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = [
        'tag-with-dash',
        'tag_with_underscore',
        'tag.with.dot',
      ];
      cacheGet.mockResolvedValue(cachedTags);

      const keywords = ['tag-with-dash'];
      await fillKeywords(keywords);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.objectContaining({
          whitelist: cachedTags,
        }),
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should handle unicode tags', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = ['中文', '日本語', '한국어', '🎉 emoji'];
      cacheGet.mockResolvedValue(cachedTags);

      const keywords = ['中文', '🎉 emoji'];
      await fillKeywords(keywords);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.objectContaining({
          whitelist: cachedTags,
        }),
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });
  });

  describe('Error handling', () => {
    it('should handle cacheGet error gracefully', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockRejectedValue(new Error('Cache error'));

      // Should not throw
      await expect(fillKeywords(['keyword1'])).resolves.not.toThrow();
    });

    it('should handle missing document.getElementById', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(null),
      };

      cacheGet.mockResolvedValue([]);

      // Should not throw when element is null
      await expect(fillKeywords(['keyword1'])).resolves.not.toThrow();
    });
  });

  describe('Tagify behavior', () => {
    it('should create Tagify instance with correct input element', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.any(Object),
      );
    });

    it('should pass whitelist from cache to Tagify', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = ['cached1', 'cached2'];
      cacheGet.mockResolvedValue(cachedTags);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor.mock.calls[0][1].whitelist).toBe(cachedTags);
    });

    it('should configure backspace behavior', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor.mock.calls[0][1].backspace).toBe('edit');
    });

    it('should configure dropdown behavior', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor.mock.calls[0][1].dropdown).toEqual({
        maxItems: 5,
        highlightFirst: true,
        includeSelectedTags: true,
      });
    });
  });

  describe('Class manipulation', () => {
    it('should remove both classes from input in a single call', async () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagsInput.classList.remove).toHaveBeenCalledTimes(1);
      expect(mockTagsInput.classList.remove).toHaveBeenCalledWith(
        'input-sm',
        'input',
      );
    });
  });

  describe('replaceKeywords', () => {
    let removeAllTags;
    let scopeListeners;

    beforeEach(async () => {
      removeAllTags = globalThis.__mockRemoveAllTags;
      scopeListeners = globalThis.__mockScopeListeners;
      removeAllTags.mockClear();
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };
      cacheGet.mockResolvedValue([]);
      await fillKeywords(['from-the-page']);
      mockAddTags.mockClear();
    });

    it('swaps the tags of the field', () => {
      expect(replaceKeywords(['stored1', 'stored2'])).toBe(true);

      expect(removeAllTags).toHaveBeenCalledTimes(1);
      expect(mockAddTags).toHaveBeenCalledWith(['stored1', 'stored2']);
    });

    it('empties the field for a bookmark without tags', () => {
      expect(replaceKeywords([])).toBe(true);

      expect(removeAllTags).toHaveBeenCalledTimes(1);
      expect(mockAddTags).not.toHaveBeenCalled();
    });

    it.each(['keydown', 'paste', 'input', 'click', 'drop'])(
      'leaves the field alone once the user has caused a %s in it',
      (eventName) => {
        scopeListeners[eventName]();

        expect(replaceKeywords(['stored'])).toBe(false);
        expect(removeAllTags).not.toHaveBeenCalled();
        expect(mockAddTags).not.toHaveBeenCalled();
      },
    );

    it('starts from scratch when the field is built again', async () => {
      scopeListeners.keydown();
      await fillKeywords(['again']);

      expect(replaceKeywords(['stored'])).toBe(true);
    });
  });

  describe('preloadKeywordAssets', () => {
    it('should read the keyword cache before fillKeywords is called', async () => {
      cacheGet.mockResolvedValue(['tag1']);

      preloadKeywordAssets();
      expect(cacheGet).toHaveBeenCalledTimes(1);

      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };
      await fillKeywords([]);

      // Consumed the preloaded result instead of reading again
      expect(cacheGet).toHaveBeenCalledTimes(1);
      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.objectContaining({ whitelist: ['tag1'] }),
      );
    });

    it('should preload only once until consumed', async () => {
      cacheGet.mockResolvedValue([]);

      preloadKeywordAssets();
      preloadKeywordAssets();
      expect(cacheGet).toHaveBeenCalledTimes(1);

      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };
      await fillKeywords([]);
    });

    it('should fall back to an empty whitelist when the cache read fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      cacheGet.mockRejectedValue(new Error('idb down'));

      preloadKeywordAssets();
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };
      await fillKeywords([]);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.objectContaining({ whitelist: [] }),
      );
      spy.mockRestore();
    });
  });
});
