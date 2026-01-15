/**
 * Unit tests for popup.js
 * Tests the popup page UI, authorization flow, error handling, and zen mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  ...global.chrome,
  i18n: {
    getMessage: vi.fn((key) => {
      const messages = {
        authorizeExtension: 'Authorize Extension',
        error: 'Error',
        saveBookmark: 'Save Bookmark',
        Checking: 'Checking',
        alreadyBookmarked: 'Already Bookmarked',
        Created: 'Created',
        Modified: 'Modified',
        ConnectionError: 'Connection Error',
      };
      return messages[key] || `[i18n:${key}]`;
    }),
  },
  runtime: {
    sendMessage: vi.fn(),
  },
};

// Mock modules
vi.mock('../src/popup/modules/hydrateForm.js', () => ({
  createForm: vi.fn(),
  hydrateForm: vi.fn(),
}));

vi.mock('../src/lib/storage.js', () => ({
  load_data: vi.fn(),
  getOption: vi.fn(),
}));

vi.mock('../src/popup/modules/saveBookmarks.js', () => ({
  default: vi.fn(),
}));

vi.mock('textfit', () => ({
  default: vi.fn(),
}));

// Import after mocking
import { createForm, hydrateForm } from '../src/popup/modules/hydrateForm.js';
import { load_data, getOption } from '../src/lib/storage.js';
import addSaveBookmarkButtonListener from '../src/popup/modules/saveBookmarks.js';
import textFit from 'textfit';

describe('popup.js', () => {
  let mockDocument;
  let mockElements;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create mock DOM elements
    mockElements = {
      bookmarkForm: {
        id: 'bookmarkForm',
        innerHTML: '',
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
      },
      formData: {
        id: 'formData',
        innerHTML: '',
      },
      errormessage: {
        id: 'errormessage',
        innerHTML: '',
      },
      saveBookmark: {
        id: 'saveBookmark',
        innerHTML: '',
        addEventListener: vi.fn(),
      },
      sub_message: {
        id: 'sub_message',
        innerHTML: '',
      },
      body: {
        innerHTML: '',
      },
    };

    // Mock document
    mockDocument = {
      readyState: 'complete',
      getElementById: vi.fn((id) => mockElements[id] || null),
      createElement: vi.fn((tag) => {
        const element = {
          tagName: tag,
          setAttribute: vi.fn(),
          appendChild: vi.fn(),
          addEventListener: vi.fn(),
          innerHTML: '',
          innerText: '',
        };
        return element;
      }),
      body: mockElements.body,
      addEventListener: vi.fn(),
    };

    // Set up global document
    global.document = mockDocument;
    global.window = {
      close: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Document ready state handling', () => {
    it('should create authorize button when no credentials exist', async () => {
      // Mock no credentials
      load_data.mockResolvedValue(undefined);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify load_data was called to check credentials
      expect(load_data).toHaveBeenCalledWith('credentials', 'appPassword');

      // Verify form was modified
      expect(mockElements.bookmarkForm.setAttribute).toHaveBeenCalledWith(
        'class',
        'flex justify-center w-full'
      );

      // Verify button was created and appended
      expect(mockDocument.createElement).toHaveBeenCalledWith('button');
      expect(mockElements.bookmarkForm.appendChild).toHaveBeenCalled();
    });

    it('should initialize zen mode when credentials exist and zen mode is enabled', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode enabled
      getOption.mockResolvedValue(true);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify zen mode was triggered
      expect(getOption).toHaveBeenCalledWith('cbx_enableZen');
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'zenMode',
      });
      expect(global.window.close).toHaveBeenCalled();
    });

    it('should create form and hydrate data when credentials exist and zen mode is disabled', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode disabled
      getOption.mockResolvedValue(false);

      // Mock successful getData response
      const mockData = {
        ok: true,
        url: 'https://example.com',
        title: 'Example',
        bookmarked: false,
      };
      global.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify form was created
      expect(createForm).toHaveBeenCalled();

      // Verify getData message was sent
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'getData',
      });

      // Verify form was hydrated
      expect(hydrateForm).toHaveBeenCalledWith(mockData);

      // Verify save bookmark button listener was added
      expect(addSaveBookmarkButtonListener).toHaveBeenCalledWith(false);
    });

    it('should create error box when getData returns error', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode disabled
      getOption.mockResolvedValue(false);

      // Mock error response
      const mockData = {
        ok: false,
        error: 'Connection failed',
      };
      global.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify form was created
      expect(createForm).toHaveBeenCalled();

      // Verify error box was created
      expect(mockElements.body.innerHTML).toContain('errormessage');
      expect(mockElements.body.innerHTML).toContain('Connection failed');

      // Verify textFit was called on error message
      expect(textFit).toHaveBeenCalledWith(mockElements.errormessage);
    });

    it('should not initialize when document readyState is not complete', async () => {
      mockDocument.readyState = 'loading';

      // Import the module
      await import('../src/popup/popup.js');

      // The readyState handler should not trigger initialization
      expect(load_data).not.toHaveBeenCalled();
    });
  });

  describe('createAuthorizeButton function', () => {
    it('should create authorize button with correct properties', async () => {
      // Mock no credentials
      load_data.mockResolvedValue(undefined);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify button was created with correct ID
      expect(mockDocument.createElement).toHaveBeenCalledWith('button');
      expect(mockElements.bookmarkForm.appendChild).toHaveBeenCalled();

      // Verify button click handler
      const button = mockElements.bookmarkForm.appendChild.mock.calls[0][0];
      expect(button.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should send authorize message and close window on button click', async () => {
      // Mock no credentials
      load_data.mockResolvedValue(undefined);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Get the click handler
      const button = mockElements.bookmarkForm.appendChild.mock.calls[0][0];
      const clickHandler = button.addEventListener.mock.calls[0][1];

      // Simulate click
      clickHandler();

      // Verify message was sent
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'authorize',
      });

      // Verify window was closed
      expect(global.window.close).toHaveBeenCalled();
    });
  });

  describe('createErrorBox function', () => {
    it('should create error box with correct message', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode disabled
      getOption.mockResolvedValue(false);

      // Mock error response
      const mockData = {
        ok: false,
        error: 'Test error message',
      };
      global.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify error box content
      expect(mockElements.body.innerHTML).toContain('errormessage');
      expect(mockElements.body.innerHTML).toContain('Test error message');
      expect(mockElements.body.innerHTML).toContain('Error:');
    });

    it('should use i18n for error label', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode disabled
      getOption.mockResolvedValue(false);

      // Mock error response
      const mockData = {
        ok: false,
        error: 'Test error',
      };
      global.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify i18n was called for error label
      expect(global.chrome.i18n.getMessage).toHaveBeenCalledWith('error');
    });
  });

  describe('zenMode function', () => {
    it('should send zenMode message and close window when zen mode is enabled', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode enabled
      getOption.mockResolvedValue(true);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify zen mode message was sent
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'zenMode',
      });

      // Verify window was closed
      expect(global.window.close).toHaveBeenCalled();
    });
  });

  describe('Form creation and hydration', () => {
    it('should call hydrateForm with correct data when getData returns ok', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode disabled
      getOption.mockResolvedValue(false);

      // Mock successful getData response
      const mockData = {
        ok: true,
        url: 'https://example.com',
        title: 'Example Page',
        bookmarked: true,
        description: 'Test description',
        keywords: ['tag1', 'tag2'],
        folders: ['1', '2'],
        bookmarkID: 123,
      };
      global.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify hydrateForm was called with the data
      expect(hydrateForm).toHaveBeenCalledWith(mockData);

      // Verify save bookmark button listener was added with bookmarked status
      expect(addSaveBookmarkButtonListener).toHaveBeenCalledWith(true);
    });

    it('should handle empty credentials correctly', async () => {
      // Mock empty string credentials (empty string is NOT undefined, so form is created)
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('');
        return Promise.resolve(undefined);
      });

      // Mock zen mode disabled
      getOption.mockResolvedValue(false);

      // Mock successful getData response
      const mockData = {
        ok: true,
        url: 'https://example.com',
        title: 'Example Page',
        bookmarked: false,
      };
      global.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Empty string is NOT undefined, so form is created and data is loaded
      expect(createForm).toHaveBeenCalled();
      expect(hydrateForm).toHaveBeenCalledWith(mockData);
    });
  });

  describe('Error handling', () => {
    it('should handle errors during initialization gracefully', async () => {
      // Mock load_data to throw an error
      load_data.mockRejectedValue(new Error('Storage error'));

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler - should not throw
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await expect(onreadystatechange()).rejects.toThrow('Storage error');
      }
    });

    it('should handle chrome.runtime.sendMessage errors', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode disabled
      getOption.mockResolvedValue(false);

      // Mock error response from sendMessage
      global.chrome.runtime.sendMessage.mockRejectedValue(
        new Error('Message error')
      );

      // Import and trigger the onreadystatechange handler
      await import('../src/popup/popup.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        // The error should propagate since there's no try/catch
        await expect(onreadystatechange()).rejects.toThrow('Message error');
      }
    });
  });
});
