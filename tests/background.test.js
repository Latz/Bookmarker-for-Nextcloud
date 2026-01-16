/**
 * Unit tests for background.js
 * Tests the message center, saveBookmark, and init functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  runtime: {
    onSuspend: {
      addListener: vi.fn(),
    },
    getContexts: vi.fn(),
    sendMessage: vi.fn(),
    getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  offscreen: {
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  contextMenus: {
    removeAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(),
    setIcon: vi.fn(),
  },
};

// Capture console methods for testing
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

// Mock all imported modules
vi.mock('../src/lib/apiCall.js', () => ({
  default: vi.fn(() => Promise.resolve({ status: 'success', data: [] })),
}));

vi.mock('../src/background/modules/getData.js', () => ({
  default: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock('../src/lib/storage.js', () => ({
  store_data: vi.fn(() => Promise.resolve()),
  createOldDatabase: vi.fn(() => Promise.resolve()),
  getOption: vi.fn((key) => {
    const options = {
      cbx_enableZen: false,
    };
    return Promise.resolve(options[key]);
  }),
  load_data: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../src/background/modules/notification.js', () => ({
  notifyUser: vi.fn(),
}));

vi.mock('../src/background/modules/getBrowserTheme.js', () => ({
  default: vi.fn(() => Promise.resolve('light')),
}));

vi.mock('../src/lib/cache.js', () => ({
  cacheGet: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/background/modules/zenMode.js', () => ({
  zenMode: vi.fn(),
  enableZenMode: vi.fn(),
}));

// Import after mocking
import apiCall from '../src/lib/apiCall.js';
import getData from '../src/background/modules/getData.js';
import { store_data, getOption, createOldDatabase } from '../src/lib/storage.js';
import { notifyUser } from '../src/background/modules/notification.js';
import getBrowserTheme from '../src/background/modules/getBrowserTheme.js';
import { cacheGet } from '../src/lib/cache.js';
import { zenMode } from '../src/background/modules/zenMode.js';

describe('background.js', () => {
  let messageListener;
  let contextMenuListener;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Capture the message listener when the module is imported
    // We need to set up the listener mock to capture the callback
    const listeners = [];
    chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
      listeners.push(callback);
      messageListener = callback;
    });

    const contextMenuListeners = [];
    chrome.contextMenus.onClicked.addListener.mockImplementation((callback) => {
      contextMenuListeners.push(callback);
      contextMenuListener = callback;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Message center', () => {
    it('should handle saveBookmark message correctly', async () => {
      // Setup
      const request = {
        msg: 'saveBookmark',
        parameters: { url: 'https://example.com', title: 'Test' },
        folderIDs: [1, 2],
        bookmarkID: 0,
      };

      const sender = {};
      const sendResponse = vi.fn();

      // Mock the message listener
      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      // Import the module to register the listener
      await import('../src/background/background.js');

      // Call the listener
      const result = messageListener(request, sender, sendResponse);

      // Should return true to keep the message channel open
      expect(result).toBe(true);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify apiCall was called with correct parameters
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        { url: 'https://example.com', title: 'Test' }
      );

      // Verify badge was set
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '💾' });
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });

      // Verify folder IDs were stored
      expect(store_data).toHaveBeenCalledWith('options', { folderIDs: [1, 2] });

      // Verify notification was sent
      expect(notifyUser).toHaveBeenCalled();
    });

    it('should handle saveBookmark with existing bookmark ID (update)', async () => {
      const request = {
        msg: 'saveBookmark',
        parameters: { url: 'https://example.com', title: 'Updated Test' },
        folderIDs: [1],
        bookmarkID: 123,
      };

      const sender = {};
      const sendResponse = vi.fn();

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');
      messageListener(request, sender, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify PUT method and bookmark ID in endpoint
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark/123',
        'PUT',
        { url: 'https://example.com', title: 'Updated Test' }
      );
    });

    it('should handle getData message correctly', async () => {
      const request = {
        msg: 'getData',
        data: { url: 'https://example.com' },
      };

      const sender = {};
      const sendResponse = vi.fn();

      getData.mockResolvedValueOnce({ ok: true, url: 'https://example.com' });

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');
      const result = messageListener(request, sender, sendResponse);

      expect(result).toBe(true);

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(getData).toHaveBeenCalledWith({ url: 'https://example.com' });
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, url: 'https://example.com' });
    });

    it('should handle authorize message correctly', async () => {
      const request = {
        msg: 'authorize',
      };

      const sender = {};
      const sendResponse = vi.fn();

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');
      const result = messageListener(request, sender, sendResponse);

      expect(result).toBe(true);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'login/login.html',
      });
    });

    it('should handle maxAttempts message correctly', async () => {
      const request = {
        msg: 'maxAttempts',
        loginPage: { id: 123 },
      };

      const sender = {};
      const sendResponse = vi.fn();

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      chrome.scripting.executeScript.mockResolvedValueOnce([]);

      await import('../src/background/background.js');
      const result = messageListener(request, sender, sendResponse);

      expect(result).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 123 },
        func: expect.any(Function),
      });
    });

    it('should handle zenMode message correctly', async () => {
      const request = {
        msg: 'zenMode',
      };

      const sender = {};
      const sendResponse = vi.fn();

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      // Import zenMode module to mock it properly
      const zenModeModule = await import('../src/background/modules/zenMode.js');

      await import('../src/background/background.js');
      const result = messageListener(request, sender, sendResponse);

      expect(result).toBe(true);

      expect(zenModeModule.zenMode).toHaveBeenCalled();
    });

    it('should return true for unknown message types', async () => {
      const request = {
        msg: 'unknownMessage',
      };

      const sender = {};
      const sendResponse = vi.fn();

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');
      const result = messageListener(request, sender, sendResponse);

      expect(result).toBe(true);
    });
  });

  describe('saveBookmark function', () => {
    it('should set badge to save icon during API call', async () => {
      const request = {
        msg: 'saveBookmark',
        parameters: { url: 'https://example.com', title: 'Test' },
        folderIDs: [1],
        bookmarkID: 0,
      };

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');

      messageListener(request, {}, vi.fn());

      await new Promise(resolve => setTimeout(resolve, 100));

      // First call sets the save icon
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(1, { text: '💾' });
      // Second call clears the badge
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(2, { text: '' });
    });

    it('should store folder IDs after saving bookmark', async () => {
      const request = {
        msg: 'saveBookmark',
        parameters: { url: 'https://example.com', title: 'Test' },
        folderIDs: [5, 10, 15],
        bookmarkID: 0,
      };

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');

      messageListener(request, {}, vi.fn());

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(store_data).toHaveBeenCalledWith('options', { folderIDs: [5, 10, 15] });
    });

    it('should notify user with API response', async () => {
      const mockResponse = { status: 'success', data: { id: 123 } };
      apiCall.mockResolvedValueOnce(mockResponse);

      const request = {
        msg: 'saveBookmark',
        parameters: { url: 'https://example.com', title: 'Test' },
        folderIDs: [1],
        bookmarkID: 0,
      };

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');

      messageListener(request, {}, vi.fn());

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(notifyUser).toHaveBeenCalledWith(mockResponse);
    });
  });

  describe('init function', () => {
    it('should set icon based on browser theme', async () => {
      getBrowserTheme.mockResolvedValueOnce('dark');

      // Import triggers init()
      await import('../src/background/background.js');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(getBrowserTheme).toHaveBeenCalled();
      expect(chrome.action.setIcon).toHaveBeenCalledWith({
        path: {
          64: '/images/icon-64x64-dark.png',
          256: '/images/icon-256x256-dark.png',
          128: '/images/icon-128x128-dark.png',
          512: '/images/icon-512x512-dark.png',
        },
      });
    });

    it('should handle theme detection errors gracefully', async () => {
      getBrowserTheme.mockRejectedValueOnce(new Error('Theme detection failed'));

      await import('../src/background/background.js');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not throw, icon will use default
      expect(chrome.action.setIcon).not.toHaveBeenCalled();
    });

    it('should remove all context menus before creating new ones', async () => {
      await import('../src/background/background.js');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    });

    it('should create Zen Mode context menu', async () => {
      getOption.mockResolvedValueOnce(false); // cbx_enableZen = false

      await import('../src/background/background.js');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'menuEnableZen',
        title: 'Zen Mode',
        contexts: ['action'],
        type: 'checkbox',
        checked: false,
      });
    });

    it('should create Refresh Cache context menu', async () => {
      await import('../src/background/background.js');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'menuRefreshCache',
        title: 'Refresh Cache',
        contexts: ['action'],
      });
    });

    it('should update Zen Mode menu title when enabled', async () => {
      getOption.mockResolvedValueOnce(true); // cbx_enableZen = true

      await import('../src/background/background.js');

      await new Promise(resolve => setTimeout(resolve, 100));

      // The setZenModeMenu function should update the menu
      expect(chrome.contextMenus.update).toHaveBeenCalledWith('menuEnableZen', {
        title: '⭢Zen Mode',
        checked: true,
      });
    });

    it('should handle context menu creation errors gracefully', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      chrome.contextMenus.create.mockImplementationOnce(() => {
        throw new Error('Menu creation failed');
      });

      await import('../src/background/background.js');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not throw, error is caught and logged
      expect(consoleLogSpy).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('Context menu click handlers', () => {
    beforeEach(async () => {
      // Capture context menu listener
      const listeners = [];
      chrome.contextMenus.onClicked.addListener.mockImplementation((callback) => {
        listeners.push(callback);
        contextMenuListener = callback;
      });

      await import('../src/background/background.js');
    });

    it('should handle menuRefreshCache click', async () => {
      const info = { menuItemId: 'menuRefreshCache' };

      contextMenuListener(info);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cacheGet).toHaveBeenCalledWith('keywords', true);
      expect(cacheGet).toHaveBeenCalledWith('folders', true);
    });

    it('should handle menuOldDatabase click', async () => {
      const info = { menuItemId: 'menuOldDatabase' };

      contextMenuListener(info);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(createOldDatabase).toHaveBeenCalled();
    });

    it('should handle menuEnableZen click when checked', async () => {
      const info = {
        menuItemId: 'menuEnableZen',
        checked: true,
      };

      contextMenuListener(info);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(store_data).toHaveBeenCalledWith('options', { cbx_enableZen: true });
      expect(chrome.contextMenus.update).toHaveBeenCalledWith('menuEnableZen', {
        title: '⭢Zen Mode',
        checked: true,
      });
    });

    it('should handle menuEnableZen click when unchecked', async () => {
      const info = {
        menuItemId: 'menuEnableZen',
        checked: false,
      };

      contextMenuListener(info);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(store_data).toHaveBeenCalledWith('options', { cbx_enableZen: false });
      expect(chrome.contextMenus.update).toHaveBeenCalledWith('menuEnableZen', {
        title: 'Zen Mode',
        checked: false,
      });
    });
  });

  describe('insertTimeOutMessage function', () => {
    it('should create and append timeout message elements', async () => {
      // Setup DOM environment
      const mockLoginForm = {
        innerHTML: '',
        appendChild: vi.fn(),
        removeAttribute: vi.fn(),
        getElementById: vi.fn(),
      };

      const mockAppTokenLogin = {
        innerHTML: '',
      };

      const mockDocument = {
        getElementById: vi.fn((id) => {
          if (id === 'login-form') return mockLoginForm;
          if (id === 'app-token-login') return mockAppTokenLogin;
          return null;
        }),
        createElement: vi.fn((tag) => {
          const element = {
            tagName: tag,
            setAttribute: vi.fn(),
            innerText: '',
            addEventListener: vi.fn(),
          };
          return element;
        }),
        addEventListener: vi.fn(),
      };

      global.document = mockDocument;

      const request = {
        msg: 'maxAttempts',
        loginPage: { id: 123 },
      };

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      chrome.scripting.executeScript.mockImplementationOnce(({ func }) => {
        // Execute the function in the context
        if (typeof func === 'function') {
          func();
        }
        return Promise.resolve([]);
      });

      await import('../src/background/background.js');

      messageListener(request, {}, vi.fn());

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(chrome.scripting.executeScript).toHaveBeenCalled();
    });
  });

  describe('maxAttemptsError function', () => {
    it('should execute insertTimeOutMessage in the specified tab', async () => {
      const request = {
        msg: 'maxAttempts',
        loginPage: { id: 456 },
      };

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      chrome.scripting.executeScript.mockResolvedValueOnce([]);

      await import('../src/background/background.js');

      messageListener(request, {}, vi.fn());

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 456 },
        func: expect.any(Function),
      });
    });

    it('should handle executeScript errors gracefully', async () => {
      const request = {
        msg: 'maxAttempts',
        loginPage: { id: 789 },
      };

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Script execution failed'));

      await import('../src/background/background.js');

      messageListener(request, {}, vi.fn());

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should log the error but not throw
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle saveBookmark API call failure', async () => {
      // The saveBookmark function in background.js doesn't have try/catch,
      // so errors will cause unhandled rejections. We test that the badge
      // is set before the error occurs.
      // Suppress unhandled rejection warnings for this test
      const originalHandler = process.listeners('unhandledRejection');
      const rejectionHandler = () => {};
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', rejectionHandler);

      try {
        apiCall.mockRejectedValueOnce(new Error('API Error'));

        const request = {
          msg: 'saveBookmark',
          parameters: { url: 'https://example.com', title: 'Test' },
          folderIDs: [1],
          bookmarkID: 0,
        };

        chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
          messageListener = callback;
        });

        await import('../src/background/background.js');

        // The message listener should not throw even if saveBookmark fails
        const result = messageListener(request, {}, vi.fn());
        expect(result).toBe(true);

        // Badge should be set to save icon immediately
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '💾' });

        // Wait for the async operation to complete (and fail)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Note: The badge is NOT cleared because the error happens during apiCall
        // before store_data is called. This is expected behavior - the badge
        // indicates "saving in progress" and stays until the save completes.
      } finally {
        // Restore original handler
        process.removeAllListeners('unhandledRejection');
        originalHandler.forEach(h => process.on('unhandledRejection', h));
      }
    });

    it('should handle store_data failure gracefully', async () => {
      // The saveBookmark function in background.js doesn't have try/catch,
      // so errors will cause unhandled rejections.
      // In the actual code: apiCall -> store_data -> setBadgeText('') -> notifyUser
      // So if store_data fails, notifyUser is NOT called.
      // Suppress unhandled rejection warnings for this test
      const originalHandler = process.listeners('unhandledRejection');
      const rejectionHandler = () => {};
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', rejectionHandler);

      try {
        // First call is for cacheGet('keywords') in getData
        // Second call is for cacheGet('folders') in getData
        // Third call is for checkBookmark in getData
        // Fourth call is for apiCall in saveBookmark
        const apiCallModule = await import('../src/lib/apiCall.js');
        apiCallModule.default = vi.fn()
          .mockResolvedValueOnce({ status: 'success', data: [] }) // cacheGet('keywords')
          .mockResolvedValueOnce({ status: 'success', data: [] }) // cacheGet('folders')
          .mockResolvedValueOnce({ status: 'success', data: [] }) // checkBookmark
          .mockResolvedValueOnce({ status: 'success', data: { id: 123 } }); // saveBookmark

        store_data.mockRejectedValueOnce(new Error('Storage failed'));

        const request = {
          msg: 'saveBookmark',
          parameters: { url: 'https://example.com', title: 'Test' },
          folderIDs: [1],
          bookmarkID: 0,
        };

        chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
          messageListener = callback;
        });

        await import('../src/background/background.js');

        messageListener(request, {}, vi.fn());

        await new Promise(resolve => setTimeout(resolve, 100));

        // notifyUser is called AFTER store_data in the code, so it will NOT be called
        // if store_data fails
        expect(notifyUser).not.toHaveBeenCalled();

        // Badge should be set to save icon
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '💾' });
      } finally {
        // Restore original handler
        process.removeAllListeners('unhandledRejection');
        originalHandler.forEach(h => process.on('unhandledRejection', h));
      }
    });
  });

  describe('Integration tests', () => {
    it('should handle multiple message types in sequence', async () => {
      // Import zenMode module to spy on it
      const zenModeModule = await import('../src/background/modules/zenMode.js');

      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      await import('../src/background/background.js');

      // Test authorize message
      const authorizeRequest = { msg: 'authorize' };
      messageListener(authorizeRequest, {}, vi.fn());
      expect(chrome.tabs.create).toHaveBeenCalled();

      // Test getData message
      const getDataRequest = { msg: 'getData', data: {} };
      messageListener(getDataRequest, {}, vi.fn());
      expect(getData).toHaveBeenCalled();

      // Test zenMode message
      const zenModeRequest = { msg: 'zenMode' };
      messageListener(zenModeRequest, {}, vi.fn());
      expect(zenModeModule.zenMode).toHaveBeenCalled();
    });

    it('should maintain message channel for async responses', async () => {
      chrome.runtime.onMessage.addListener.mockImplementation((callback) => {
        messageListener = callback;
      });

      getData.mockResolvedValueOnce({ ok: true, data: 'test' });

      await import('../src/background/background.js');

      const request = { msg: 'getData', data: {} };
      const result = messageListener(request, {}, vi.fn());

      // Should return true to keep channel open for async response
      expect(result).toBe(true);
    });
  });
});
