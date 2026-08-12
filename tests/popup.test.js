/**
 * Unit tests for popup.js
 * Tests the popup page UI, authorization flow, error handling, and zen mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
globalThis.chrome = {
  ...globalThis.chrome,
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
  // popup.js prefetches the render-path options in parallel with the getData
  // round trip; resolve to an empty object so the fire-and-forget call settles.
  getOptions: vi.fn(() => Promise.resolve({})),
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

  // popup.js kicks off async work at import time; give it a few macrotask
  // turns to settle before asserting.
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Serialize a mock element tree into a flat string for innerHTML assertions
    const serializeNode = (node) => {
      if (typeof node === 'string') return node;
      if (!node || typeof node !== 'object') return '';
      let s = '';
      if (node.id) s += `id="${node.id}" `;
      if (node.textContent) s += node.textContent + ' ';
      if (node._children) node._children.forEach((c) => { s += serializeNode(c); });
      return s;
    };

    // Create mock DOM elements
    mockElements = {
      bookmarkForm: {
        id: 'bookmarkForm',
        innerHTML: '',
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        replaceChildren: vi.fn(),
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
        replaceChildren: vi.fn(function (...nodes) {
          mockElements.body.innerHTML = nodes.map(serializeNode).join('');
        }),
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
          textContent: '',
          className: '',
          id: '',
          src: '',
          _children: [],
          append: vi.fn(function (...nodes) {
            element._children.push(...nodes);
            nodes.forEach((n) => {
              if (typeof n === 'string') element.textContent += n;
            });
          }),
        };
        return element;
      }),
      body: mockElements.body,
      addEventListener: vi.fn(),
    };

    // Set up global document
    globalThis.document = mockDocument;
    globalThis.window = {
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

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Verify load_data was called to check credentials
      expect(load_data).toHaveBeenCalledWith('credentials', 'appPassword');

      // Verify form was modified
      expect(mockElements.bookmarkForm.setAttribute).toHaveBeenCalledWith(
        'class',
        'flex justify-center w-full'
      );

      // Verify button was created and appended
      expect(mockDocument.createElement).toHaveBeenCalledWith('button');
      expect(mockElements.bookmarkForm.replaceChildren).toHaveBeenCalled();
    });

    it('should initialize zen mode when credentials exist and zen mode is enabled', async () => {
      // Mock credentials exist
      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });

      // Mock zen mode enabled
      getOption.mockResolvedValue(true);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Verify zen mode was triggered
      expect(getOption).toHaveBeenCalledWith('cbx_enableZen');
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'zenMode',
      });
      expect(globalThis.window.close).toHaveBeenCalled();
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
      globalThis.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Verify form was created
      expect(createForm).toHaveBeenCalled();

      // Verify getData message was sent
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
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
        // terminal, so the retry loop does not run -- retry behaviour is
        // covered separately in 'Retry behaviour'
        retryable: false,
      };
      globalThis.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Verify form was created
      expect(createForm).toHaveBeenCalled();

      // Verify error box was created
      expect(mockElements.body.innerHTML).toContain('errormessage');
      expect(mockElements.body.innerHTML).toContain('Connection failed');

      // Verify textFit was called on error message
      expect(textFit).toHaveBeenCalledWith(mockElements.errormessage);
    });

    it('should read credentials before the document is ready but not touch the DOM', async () => {
      // Contract change: reading credentials and dispatching getData no longer
      // wait for DOM readiness -- that decoupling is the point, since neither
      // touches the DOM and the round trip is the slowest part of opening the
      // popup. What must still wait is any rendering.
      mockDocument.readyState = 'loading';
      load_data.mockResolvedValue(undefined);

      await import('../src/popup/popup.js');
      await flush();

      // Off-DOM work has started...
      expect(load_data).toHaveBeenCalledWith('credentials', 'appPassword');
      // ...but nothing has been rendered yet.
      expect(createForm).not.toHaveBeenCalled();
      expect(mockElements.bookmarkForm.replaceChildren).not.toHaveBeenCalled();
    });

    it('should render once the document becomes ready', async () => {
      mockDocument.readyState = 'loading';
      load_data.mockResolvedValue(undefined);

      await import('../src/popup/popup.js');
      await flush();
      expect(mockElements.bookmarkForm.replaceChildren).not.toHaveBeenCalled();

      // Signal readiness the way the browser would
      mockDocument.readyState = 'complete';
      mockDocument.onreadystatechange();
      await flush();

      expect(mockElements.bookmarkForm.replaceChildren).toHaveBeenCalled();
    });
  });

  describe('Retry behaviour', () => {
    const withCredentials = () => {
      load_data.mockImplementation((store, key) =>
        Promise.resolve(key === 'appPassword' ? 'test-password' : undefined),
      );
      // cbx_enableZen false; input_numberOfRetries falls back to 5
      getOption.mockResolvedValue(false);
    };

    it('should not retry a terminal error', async () => {
      withCredentials();
      globalThis.chrome.runtime.sendMessage.mockResolvedValue({
        ok: false,
        error: 'URL is not bookmarkable',
        retryable: false,
      });

      await import('../src/popup/popup.js');
      await flush();

      const getDataCalls =
        globalThis.chrome.runtime.sendMessage.mock.calls.filter(
          ([msg]) => msg?.msg === 'getData',
        );
      expect(getDataCalls).toHaveLength(1);
    });

    it('should retry an error that is not marked terminal', async () => {
      vi.useFakeTimers();
      withCredentials();
      globalThis.chrome.runtime.sendMessage.mockResolvedValue({
        ok: false,
        error: 'Connection failed',
      });

      await import('../src/popup/popup.js');
      await vi.runAllTimersAsync();

      const getDataCalls =
        globalThis.chrome.runtime.sendMessage.mock.calls.filter(
          ([msg]) => msg?.msg === 'getData',
        );
      expect(getDataCalls.length).toBeGreaterThan(1);
      vi.useRealTimers();
    });
  });

  describe('createAuthorizeButton function', () => {
    it('should create authorize button with correct properties', async () => {
      // Mock no credentials
      load_data.mockResolvedValue(undefined);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Verify button was created with correct ID
      expect(mockDocument.createElement).toHaveBeenCalledWith('button');
      expect(mockElements.bookmarkForm.replaceChildren).toHaveBeenCalled();

      // Verify button click handler
      const button = mockElements.bookmarkForm.replaceChildren.mock.calls[0][0];
      expect(button.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should send authorize message and close window on button click', async () => {
      // Mock no credentials
      load_data.mockResolvedValue(undefined);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Get the click handler
      const button = mockElements.bookmarkForm.replaceChildren.mock.calls[0][0];
      const clickHandler = button.addEventListener.mock.calls[0][1];

      // Simulate click
      clickHandler();

      // Verify message was sent
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'authorize',
      });

      // Verify window was closed
      expect(globalThis.window.close).toHaveBeenCalled();
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
        retryable: false,
      };
      globalThis.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

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
        retryable: false,
      };
      globalThis.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Verify i18n was called for error label
      expect(globalThis.chrome.i18n.getMessage).toHaveBeenCalledWith('error');
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

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Verify zen mode message was sent
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'zenMode',
      });

      // Verify window was closed
      expect(globalThis.window.close).toHaveBeenCalled();
    });

    it('should send zenMode message BEFORE closing window', async () => {
      const callOrder = [];

      load_data.mockImplementation((store, key) => {
        if (key === 'appPassword') return Promise.resolve('test-password');
        return Promise.resolve(undefined);
      });
      getOption.mockResolvedValue(true);

      globalThis.chrome.runtime.sendMessage.mockImplementation(() => {
        callOrder.push('sendMessage');
        return Promise.resolve();
      });
      globalThis.window.close = vi.fn(() => callOrder.push('close'));

      await import('../src/popup/popup.js');
      await flush();

      expect(callOrder).toEqual(['sendMessage', 'close']);
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
      globalThis.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

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
      globalThis.chrome.runtime.sendMessage.mockResolvedValue(mockData);

      // popup.js bootstraps itself on import
      await import('../src/popup/popup.js');

      // popup.js now starts its own bootstrap at module load and awaits DOM
      // readiness internally, so there is no handler to invoke -- just let the
      // pending microtasks/timers settle.
      await flush();

      // Empty string is NOT undefined, so form is created and data is loaded
      expect(createForm).toHaveBeenCalled();
      expect(hydrateForm).toHaveBeenCalledWith(mockData);
    });
  });

  describe('Error handling', () => {
    it('should report initialization errors instead of failing silently', async () => {
      // The bootstrap is self-starting and nothing awaits it, so a failure can
      // no longer be observed as a rejected handler. popup.js reports it.
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      load_data.mockRejectedValue(new Error('Storage error'));

      await import('../src/popup/popup.js');
      await flush();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[popup] initialisation failed:',
        expect.objectContaining({ message: 'Storage error' }),
      );
      consoleErrorSpy.mockRestore();
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
      globalThis.chrome.runtime.sendMessage.mockRejectedValue(
        new Error('Message error')
      );

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await import('../src/popup/popup.js');
      await flush();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[popup] initialisation failed:',
        expect.objectContaining({ message: 'Message error' }),
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
