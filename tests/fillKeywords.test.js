/**
 * Unit tests for fillKeywords module
 * Tests the function that populates keyword input with Tagify
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies - hoisted to top of file
vi.mock('../src/lib/cache.js', () => ({
  cacheGet: vi.fn(),
}));

// Mock Tagify with factory that stores mocks in global storage
// Note: vi.mock() is hoisted, so we can't use local variables
vi.mock('@yaireo/tagify', () => {
  const mockAddTags = vi.fn();
  const mockTagifyConstructor = vi.fn(function() {
    return { addTags: mockAddTags };
  });

  // Store references on global object for tests to access
  // eslint-disable-next-line no-undef
  global.__mockAddTags = mockAddTags;
  // eslint-disable-next-line no-undef
  global.__mockTagifyConstructor = mockTagifyConstructor;

  return {
    default: mockTagifyConstructor,
  };
});

// Import the module after mocking
import fillKeywords from '../src/popup/modules/fillKeywords.js';
import { cacheGet } from '../src/lib/cache.js';

describe('fillKeywords', () => {
  let mockTagsInput;
  let mockTagifyConstructor;
  let mockAddTags;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get the mock constructor from global storage
    mockTagifyConstructor = global.__mockTagifyConstructor;
    mockAddTags = global.__mockAddTags;

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
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(document.getElementById).toHaveBeenCalledWith('keywords');
    });

    it('should remove input-sm class from input', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagsInput.classList.remove).toHaveBeenCalledWith('input-sm');
    });

    it('should remove input class from input', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagsInput.classList.remove).toHaveBeenCalledWith('input');
    });
  });

  describe('Tagify initialization', () => {
    it('should initialize Tagify with correct configuration', async () => {
      global.document = {
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
        },
      });
    });

    it('should handle empty cached tags array', async () => {
      global.document = {
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
        },
      });
    });

    it('should handle cacheGet returning non-array value', async () => {
      global.document = {
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
        },
      });
    });

    it('should handle cacheGet returning object', async () => {
      global.document = {
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
        },
      });
    });
  });

  describe('Keyword addition', () => {
    it('should add keywords when provided', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      const keywords = ['keyword1', 'keyword2', 'keyword3'];
      await fillKeywords(keywords);

      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should not add keywords when array is empty', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords([]);

      expect(mockAddTags).not.toHaveBeenCalled();
    });

    it('should not add keywords when keywords is undefined', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(undefined);

      expect(mockAddTags).not.toHaveBeenCalled();
    });

    it('should not add keywords when keywords is null', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(null);

      expect(mockAddTags).not.toHaveBeenCalled();
    });

    it('should handle single keyword string', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords('singleKeyword');

      expect(mockAddTags).toHaveBeenCalledWith('singleKeyword');
    });
  });

  describe('Real-world scenarios', () => {
    it('should work with typical cached tags from Nextcloud', async () => {
      global.document = {
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
        })
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should handle large number of cached tags', async () => {
      global.document = {
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
        })
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should handle special characters in tags', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = ['tag-with-dash', 'tag_with_underscore', 'tag.with.dot'];
      cacheGet.mockResolvedValue(cachedTags);

      const keywords = ['tag-with-dash'];
      await fillKeywords(keywords);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(
        mockTagsInput,
        expect.objectContaining({
          whitelist: cachedTags,
        })
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });

    it('should handle unicode tags', async () => {
      global.document = {
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
        })
      );
      expect(mockAddTags).toHaveBeenCalledWith(keywords);
    });
  });

  describe('Error handling', () => {
    it('should handle cacheGet error gracefully', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockRejectedValue(new Error('Cache error'));

      // Should not throw
      await expect(fillKeywords(['keyword1'])).resolves.not.toThrow();
    });

    it('should handle missing document.getElementById', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(null),
      };

      cacheGet.mockResolvedValue([]);

      // Should not throw when element is null
      await expect(fillKeywords(['keyword1'])).resolves.not.toThrow();
    });
  });

  describe('Tagify behavior', () => {
    it('should create Tagify instance with correct input element', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor).toHaveBeenCalledWith(mockTagsInput, expect.any(Object));
    });

    it('should pass whitelist from cache to Tagify', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      const cachedTags = ['cached1', 'cached2'];
      cacheGet.mockResolvedValue(cachedTags);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor.mock.calls[0][1].whitelist).toBe(cachedTags);
    });

    it('should configure backspace behavior', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor.mock.calls[0][1].backspace).toBe('edit');
    });

    it('should configure dropdown behavior', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagifyConstructor.mock.calls[0][1].dropdown).toEqual({
        maxItems: 5,
        highlightFirst: true,
      });
    });
  });

  describe('Class manipulation', () => {
    it('should remove both classes from input', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagsInput.classList.remove).toHaveBeenCalledWith('input-sm');
      expect(mockTagsInput.classList.remove).toHaveBeenCalledWith('input');
    });

    it('should call remove in correct order', async () => {
      global.document = {
        getElementById: vi.fn().mockReturnValue(mockTagsInput),
      };

      cacheGet.mockResolvedValue([]);

      await fillKeywords(['keyword1']);

      expect(mockTagsInput.classList.remove).toHaveBeenNthCalledWith(1, 'input-sm');
      expect(mockTagsInput.classList.remove).toHaveBeenNthCalledWith(2, 'input');
    });
  });
});
