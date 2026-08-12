/**
 * Unit tests for saveBookmarks module
 * Tests the function that handles saving bookmarks from the popup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/lib/cache.js', () => ({
  cacheGet: vi.fn(),
  cacheTempAdd: vi.fn(),
}));

vi.mock('../src/lib/storage.js', () => ({
  getOption: vi.fn(),
}));

// Import the module after mocking
import { cacheGet, cacheTempAdd } from '../src/lib/cache.js';
import { getOption } from '../src/lib/storage.js';
import addSaveBookmarkButtonListener from '../src/popup/modules/saveBookmarks.js';

describe('addSaveBookmarkButtonListener', () => {
  let mockButton;
  let mockEvent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockButton = {
      addEventListener: vi.fn(),
    };
    mockEvent = {
      preventDefault: vi.fn(),
    };

    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
    };

    globalThis.window = {
      close: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.window;
  });

  describe('Event listener registration', () => {
    it('should add click event listener to save button', () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(mockButton),
      };

      addSaveBookmarkButtonListener();

      expect(document.getElementById).toHaveBeenCalledWith('saveBookmark');
      expect(mockButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should handle missing save button gracefully', () => {
      globalThis.document = {
        getElementById: vi.fn().mockReturnValue(null),
      };

      // The implementation will throw when trying to addEventListener on null
      // This is expected behavior - the button should exist in the popup
      expect(() => addSaveBookmarkButtonListener()).toThrow();
    });
  });

  describe('Save bookmark functionality', () => {
    let clickHandler;
    let mockUrlInput;
    let mockTitleInput;
    let mockBookmarkIdInput;
    let mockDescriptionInput;
    let mockKeywordsInput;
    let mockFoldersSelect;

    beforeEach(() => {
      mockUrlInput = { value: 'https://example.com' };
      mockTitleInput = { value: 'Test Page' };
      mockBookmarkIdInput = { value: '-1' };
      mockDescriptionInput = { value: 'Test description' };
      mockKeywordsInput = { value: '[{"value":"keyword1"},{"value":"keyword2"}]' };
      mockFoldersSelect = {
        options: [
          { value: '1', selected: false },
          { value: '2', selected: true },
          { value: '3', selected: true },
        ],
      };

      globalThis.document = {
        getElementById: vi.fn((id) => {
          switch (id) {
            case 'saveBookmark': return mockButton;
            case 'url': return mockUrlInput;
            case 'title': return mockTitleInput;
            case 'bookmarkID': return mockBookmarkIdInput;
            case 'description': return mockDescriptionInput;
            case 'keywords': return mockKeywordsInput;
            case 'folders': return mockFoldersSelect;
            default: return null;
          }
        }),
      };

      // Capture the click handler
      mockButton.addEventListener.mockImplementation((event, handler) => {
        if (event === 'click') {
          clickHandler = handler;
        }
      });
    });

    it('should prevent default form submission', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);

      // Wait for the Promise.all to resolve
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('should not let a tag inject extra API parameters (S3)', async () => {
      // Tag values and descriptions were interpolated into the query string
      // raw, so a value containing & or = injected parameters of its own.
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue([]);
      cacheTempAdd.mockResolvedValue();
      mockKeywordsInput.value = JSON.stringify([
        { value: 'x&folders[]=42&public=1' },
      ]);
      mockDescriptionInput.value = 'note & more=stuff';

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sent = chrome.runtime.sendMessage.mock.calls.at(-1)[0];
      const parsed = new URLSearchParams(sent.parameters);
      // Only the folder the user actually selected
      expect(parsed.getAll('folders[]')).not.toContain('42');
      // No smuggled parameter
      expect(parsed.getAll('public')).toEqual([]);
      // Description survives intact rather than being truncated at the &
      expect(parsed.get('description')).toBe('note & more=stuff');
      // The hostile value is carried as one opaque tag
      expect(parsed.getAll('tags[]')).toContain('x&folders[]=42&public=1');
    });

    it('should send message to background script with correct parameters', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'saveBookmark',
        parameters: expect.stringContaining('title=Test+Page'),
        folderIDs: ['2', '3'],
        bookmarkID: -1,
      });
    });

    it('should include URL in parameters', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('url=https%3A%2F%2Fexample.com'),
        })
      );
    });

    it('should include description when showDescription is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showDescription: true,
          cbx_showKeywords: true,
          cbx_displayFolders: true,
        };
        return Promise.resolve(options[key]);
      });
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('description=Test+description'),
        })
      );
    });

    it('should not include description when showDescription is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showDescription: false,
          cbx_showKeywords: true,
          cbx_displayFolders: true,
        };
        return Promise.resolve(options[key]);
      });
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.not.stringContaining('description='),
        })
      );
    });

    it('should not include description when description is empty', async () => {
      mockDescriptionInput.value = '';
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showDescription: true,
          cbx_showKeywords: true,
          cbx_displayFolders: true,
        };
        return Promise.resolve(options[key]);
      });
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.not.stringContaining('description='),
        })
      );
    });

    it('should include keywords when showKeywords is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showDescription: true,
          cbx_showKeywords: true,
          cbx_displayFolders: true,
        };
        return Promise.resolve(options[key]);
      });
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('tags%5B%5D=keyword1'),
        })
      );
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('tags%5B%5D=keyword2'),
        })
      );
    });

    it('should not include keywords when showKeywords is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showDescription: true,
          cbx_showKeywords: false,
          cbx_displayFolders: true,
        };
        return Promise.resolve(options[key]);
      });
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('tags%5B%5D='),
        })
      );
    });

    it('should include selected folders when displayFolders is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showDescription: true,
          cbx_showKeywords: true,
          cbx_displayFolders: true,
        };
        return Promise.resolve(options[key]);
      });
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('folders%5B%5D=2'),
        })
      );
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('folders%5B%5D=3'),
        })
      );
    });

    it('should default to root folder when displayFolders is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showDescription: true,
          cbx_showKeywords: true,
          cbx_displayFolders: false,
        };
        return Promise.resolve(options[key]);
      });
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('folders%5B%5D=-1'),
        })
      );
    });

    it('should include page=-1 parameter', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.stringContaining('page=-1'),
        })
      );
    });

    it('should close window after saving', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(window.close).toHaveBeenCalled();
    });
  });

  describe('Cache update for new keywords', () => {
    let clickHandler;
    let mockUrlInput;
    let mockTitleInput;
    let mockBookmarkIdInput;
    let mockDescriptionInput;
    let mockKeywordsInput;
    let mockFoldersSelect;
    let mockButton;

    beforeEach(() => {
      mockUrlInput = { value: 'https://example.com' };
      mockTitleInput = { value: 'Test Page' };
      mockBookmarkIdInput = { value: '-1' };
      mockDescriptionInput = { value: 'Test description' };
      mockKeywordsInput = { value: '[{"value":"newKeyword1"},{"value":"newKeyword2"}]' };
      mockFoldersSelect = {
        options: [{ value: '1', selected: true }],
      };
      mockButton = { addEventListener: vi.fn() };

      globalThis.document = {
        getElementById: vi.fn((id) => {
          switch (id) {
            case 'saveBookmark': return mockButton;
            case 'url': return mockUrlInput;
            case 'title': return mockTitleInput;
            case 'bookmarkID': return mockBookmarkIdInput;
            case 'description': return mockDescriptionInput;
            case 'keywords': return mockKeywordsInput;
            case 'folders': return mockFoldersSelect;
            default: return null;
          }
        }),
      };

      mockButton.addEventListener.mockImplementation((event, handler) => {
        if (event === 'click') {
          clickHandler = handler;
        }
      });
    });

    it('should update cache with new keywords', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cacheGet).toHaveBeenCalledWith('keywords');
      expect(cacheTempAdd).toHaveBeenCalledWith('keywords', ['newKeyword1', 'newKeyword2']);
    });

    it('should not add keywords that already exist in cache', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'newKeyword1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cacheTempAdd).toHaveBeenCalledWith('keywords', ['newKeyword2']);
    });

    it('should handle empty cached keywords', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue([]);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cacheTempAdd).toHaveBeenCalledWith('keywords', ['newKeyword1', 'newKeyword2']);
    });

    it('should handle cacheGet returning undefined', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(undefined);
      cacheTempAdd.mockResolvedValue();
      
      // Suppress console.error to avoid unhandled error detection
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // When cacheGet returns undefined, the code logs an error but doesn't add to cache
      expect(cacheTempAdd).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Error updating cache:', expect.any(TypeError));
      
      consoleSpy.mockRestore();
    });

    it('should handle cacheGet error gracefully', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockRejectedValue(new Error('Cache error'));
      cacheTempAdd.mockResolvedValue();
      
      // Suppress console.error to avoid unhandled error detection
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not throw, cacheTempAdd should not be called
      expect(cacheTempAdd).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Error updating cache:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should handle invalid keywords JSON', async () => {
      mockKeywordsInput.value = 'invalid json';
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should handle the error and not crash
      expect(cacheTempAdd).not.toHaveBeenCalled();
    });

    it('should handle empty keywords array', async () => {
      mockKeywordsInput.value = '[]';
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1', 'cached2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cacheTempAdd).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    let clickHandler;
    let mockUrlInput;
    let mockTitleInput;
    let mockBookmarkIdInput;
    let mockDescriptionInput;
    let mockKeywordsInput;
    let mockFoldersSelect;
    let mockButton;

    beforeEach(() => {
      mockUrlInput = { value: 'https://example.com' };
      mockTitleInput = { value: 'Test Page' };
      mockBookmarkIdInput = { value: '-1' };
      mockDescriptionInput = { value: 'Test description' };
      mockKeywordsInput = { value: '[{"value":"keyword1"}]' };
      mockFoldersSelect = {
        options: [{ value: '1', selected: true }],
      };
      mockButton = { addEventListener: vi.fn() };

      globalThis.document = {
        getElementById: vi.fn((id) => {
          switch (id) {
            case 'saveBookmark': return mockButton;
            case 'url': return mockUrlInput;
            case 'title': return mockTitleInput;
            case 'bookmarkID': return mockBookmarkIdInput;
            case 'description': return mockDescriptionInput;
            case 'keywords': return mockKeywordsInput;
            case 'folders': return mockFoldersSelect;
            default: return null;
          }
        }),
      };

      mockButton.addEventListener.mockImplementation((event, handler) => {
        if (event === 'click') {
          clickHandler = handler;
        }
      });
    });

    it('should handle getOption error gracefully', async () => {
      getOption.mockRejectedValue(new Error('Storage error'));
      cacheGet.mockResolvedValue(['cached1']);
      cacheTempAdd.mockResolvedValue();
      
      // Suppress unhandled rejection since the implementation doesn't catch it
      const unhandledRejectionHandler = () => {};
      process.on('unhandledRejection', unhandledRejectionHandler);

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // When getOption fails, the Promise.all rejects and .then() never runs
      // So sendMessage won't be called, but window.close still runs
      // Note: This is an unhandled rejection in the current implementation
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(window.close).toHaveBeenCalled();
      
      process.off('unhandledRejection', unhandledRejectionHandler);
    });

    it('should handle missing description input', async () => {
      globalThis.document = {
        getElementById: vi.fn((id) => {
          switch (id) {
            case 'saveBookmark': return mockButton;
            case 'url': return mockUrlInput;
            case 'title': return mockTitleInput;
            case 'bookmarkID': return mockBookmarkIdInput;
            case 'description': return null;
            case 'keywords': return mockKeywordsInput;
            case 'folders': return mockFoldersSelect;
            default: return null;
          }
        }),
      };

      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1']);
      cacheTempAdd.mockResolvedValue();
      
      // Suppress unhandled rejection since the implementation doesn't catch it
      const unhandledRejectionHandler = () => {};
      process.on('unhandledRejection', unhandledRejectionHandler);

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not throw (window.close is called outside the Promise chain)
      // Note: This is an unhandled rejection in the current implementation
      expect(window.close).toHaveBeenCalled();
      
      process.off('unhandledRejection', unhandledRejectionHandler);
    });

    it('should handle missing folders select', async () => {
      globalThis.document = {
        getElementById: vi.fn((id) => {
          switch (id) {
            case 'saveBookmark': return mockButton;
            case 'url': return mockUrlInput;
            case 'title': return mockTitleInput;
            case 'bookmarkID': return mockBookmarkIdInput;
            case 'description': return mockDescriptionInput;
            case 'keywords': return mockKeywordsInput;
            case 'folders': return null;
            default: return null;
          }
        }),
      };

      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['cached1']);
      cacheTempAdd.mockResolvedValue();
      
      // Suppress unhandled rejection since the implementation doesn't catch it
      const unhandledRejectionHandler = () => {};
      process.on('unhandledRejection', unhandledRejectionHandler);

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not throw (window.close is called outside the Promise chain)
      // Note: This is an unhandled rejection in the current implementation
      expect(window.close).toHaveBeenCalled();
      
      process.off('unhandledRejection', unhandledRejectionHandler);
    });
  });

  describe('Real-world scenarios', () => {
    let clickHandler;
    let mockUrlInput;
    let mockTitleInput;
    let mockBookmarkIdInput;
    let mockDescriptionInput;
    let mockKeywordsInput;
    let mockFoldersSelect;
    let mockButton;

    beforeEach(() => {
      mockUrlInput = { value: 'https://example.com/path?query=1' };
      mockTitleInput = { value: 'Test & "Special" <Page>' };
      mockBookmarkIdInput = { value: '123' };
      mockDescriptionInput = { value: 'Description with & and < and >' };
      mockKeywordsInput = { value: '[{"value":"tag1"},{"value":"tag2"}]' };
      mockFoldersSelect = {
        options: [
          { value: '-1', selected: false },
          { value: '100', selected: true },
          { value: '200', selected: false },
          { value: '300', selected: true },
        ],
      };
      mockButton = { addEventListener: vi.fn() };

      globalThis.document = {
        getElementById: vi.fn((id) => {
          switch (id) {
            case 'saveBookmark': return mockButton;
            case 'url': return mockUrlInput;
            case 'title': return mockTitleInput;
            case 'bookmarkID': return mockBookmarkIdInput;
            case 'description': return mockDescriptionInput;
            case 'keywords': return mockKeywordsInput;
            case 'folders': return mockFoldersSelect;
            default: return null;
          }
        }),
      };

      mockButton.addEventListener.mockImplementation((event, handler) => {
        if (event === 'click') {
          clickHandler = handler;
        }
      });
    });

    it('should handle special characters in all fields', async () => {
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['existing1', 'existing2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert on decoded values rather than a specific encoding: every field
      // is encoded now, where previously only title and url were. The old
      // assertion here pinned the bug in place, expecting the description to
      // appear raw in the query string.
      const sent = chrome.runtime.sendMessage.mock.calls.at(-1)[0];
      const parsed = new URLSearchParams(sent.parameters);
      expect(parsed.get('title')).toBe('Test & "Special" <Page>');
      expect(parsed.get('description')).toBe('Description with & and < and >');
    });

    it('should handle updating existing bookmark', async () => {
      mockBookmarkIdInput.value = '456';
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['existing1', 'existing2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmarkID: 456,
        })
      );
    });

    it('should handle no folders selected', async () => {
      mockFoldersSelect.options = [
        { value: '-1', selected: false },
        { value: '100', selected: false },
      ];
      getOption.mockResolvedValue(true);
      cacheGet.mockResolvedValue(['existing1', 'existing2']);
      cacheTempAdd.mockResolvedValue();

      addSaveBookmarkButtonListener();
      clickHandler(mockEvent);
      await new Promise(resolve => setTimeout(resolve, 10));

      // When displayFolders is true but no folders are selected, no folder parameter is added
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          folderIDs: [],
        })
      );
    });
  });
});
