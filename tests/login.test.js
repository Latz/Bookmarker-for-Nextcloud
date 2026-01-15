/**
 * Unit tests for login.js
 * Tests the login page UI, server connection, login polling, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  ...global.chrome,
  i18n: {
    getMessage: vi.fn((key) => {
      const messages = {
        OpenLoginPage: 'Open Login Page',
        Loading: 'Loading',
        LoginServerError: 'Login Server Error',
      };
      return messages[key] || `[i18n:${key}]`;
    }),
  },
  tabs: {
    create: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
  },
};

// Mock modules
vi.mock('../src/lib/apiCall.js', () => ({
  default: vi.fn(),
}));

vi.mock('../src/lib/storage.js', () => ({
  store_data: vi.fn(),
}));

// Import after mocking
import apiCall from '../src/lib/apiCall.js';
import { store_data } from '../src/lib/storage.js';

describe('login.js', () => {
  let mockDocument;
  let mockElements;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create mock DOM elements
    mockElements = {
      msg: {
        id: 'msg',
        innerText: '',
        innerHTML: '',
      },
      testServer: {
        id: 'testServer',
        innerHTML: '',
        addEventListener: vi.fn(),
      },
      serverName: {
        id: 'serverName',
        value: '',
        focus: vi.fn(),
        addEventListener: vi.fn(),
      },
      error: {
        id: 'error',
        innerHTML: '',
        innerText: '',
      },
    };

    // Mock document
    mockDocument = {
      readyState: 'complete',
      getElementById: vi.fn((id) => mockElements[id] || null),
      addEventListener: vi.fn(),
    };

    // Set up global document
    global.document = mockDocument;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Document ready state handling', () => {
    it('should initialize when document readyState is complete', async () => {
      // Import and trigger the onreadystatechange handler
      await import('../src/login/login.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify elements were initialized
      expect(mockElements.msg.innerText).toBe('');
      expect(mockElements.testServer.innerHTML).toBe('Open Login Page');

      // Verify event listeners were added
      expect(mockElements.testServer.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
      expect(mockElements.serverName.addEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });

    it('should not initialize when document readyState is not complete', async () => {
      mockDocument.readyState = 'loading';

      // Import the module
      await import('../src/login/login.js');

      // The readyState handler should not trigger initialization
      expect(mockElements.testServer.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('openServerPage function', () => {
    let openServerPage;

    beforeEach(async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler to extract openServerPage function
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];
      openServerPage = clickHandler;
    });

    it('should clear error and message elements', async () => {
      // Setup initial state with error messages
      mockElements.error.innerHTML = 'Previous error';
      mockElements.msg.innerHTML = 'Previous message';

      // Mock successful API response
      apiCall.mockResolvedValue({
        login: 'https://example.com/login',
        poll: {
          endpoint: 'https://example.com/poll',
          token: 'test-token',
          value: 'https://example.com',
        },
      });

      // Mock chrome.tabs.create to return immediately (we won't wait for polling)
      chrome.tabs.create.mockResolvedValue({ id: 123 });

      // Call openServerPage
      await openServerPage();

      // Verify error and message elements are cleared
      expect(mockElements.error.innerHTML).toBe('');
      expect(mockElements.msg.innerHTML).toBe('');
    });

    it('should show loading state when clicked', async () => {
      mockElements.serverName.value = 'https://example.com';

      // Mock successful API response
      apiCall.mockResolvedValue({
        login: 'https://example.com/login',
        poll: {
          endpoint: 'https://example.com/poll',
          token: 'test-token',
          value: 'https://example.com',
        },
      });

      // Mock chrome.tabs.create to return immediately
      chrome.tabs.create.mockResolvedValue({ id: 123 });

      // Call openServerPage
      await openServerPage();

      // Verify loading state
      expect(mockElements.testServer.innerHTML).toBe('Loading...');
    });

    it('should call apiCall with correct parameters', async () => {
      mockElements.serverName.value = 'https://example.com';

      // Mock successful API response
      apiCall.mockResolvedValue({
        login: 'https://example.com/login',
        poll: {
          endpoint: 'https://example.com/poll',
          token: 'test-token',
          value: 'https://example.com',
        },
      });

      // Mock chrome.tabs.create to return immediately
      chrome.tabs.create.mockResolvedValue({ id: 123 });

      // Call openServerPage
      await openServerPage();

      // Verify apiCall was called with correct parameters
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/login/v2',
        'POST',
        {
          host: 'https://example.com',
          loginflow: true,
        }
      );
    });

    it('should handle Enter key press on serverName input', async () => {
      // Get the keydown handler
      const keydownHandler = mockElements.serverName.addEventListener.mock.calls[0][1];

      // Mock the openServerPage function call
      apiCall.mockResolvedValue({
        login: 'https://example.com/login',
        poll: {
          endpoint: 'https://example.com/poll',
          token: 'test-token',
          value: 'https://example.com',
        },
      });
      chrome.tabs.create.mockResolvedValue({ id: 123 });

      // Simulate Enter key press
      const mockEvent = {
        key: 'Enter',
        preventDefault: vi.fn(),
      };

      // Call the keydown handler
      keydownHandler(mockEvent);

      // Verify preventDefault was called
      expect(mockEvent.preventDefault).toHaveBeenCalled();

      // Verify apiCall was triggered
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(apiCall).toHaveBeenCalled();
    });

    it('should not trigger on other key presses', async () => {
      // Get the keydown handler
      const keydownHandler = mockElements.serverName.addEventListener.mock.calls[0][1];

      // Simulate other key press
      const mockEvent = {
        key: 'a',
        preventDefault: vi.fn(),
      };

      // Call the keydown handler
      keydownHandler(mockEvent);

      // Verify preventDefault was NOT called
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('loginPoll function', () => {
    it('should create login tab and poll for authorization', async () => {
      // Mock setTimeout to speed up polling
      const originalSetTimeout = global.setTimeout;
      vi.useFakeTimers();

      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock successful API response with login data
      const loginResponse = {
        login: 'https://example.com/login',
        poll: {
          endpoint: 'https://example.com/poll',
          token: 'test-token',
          value: 'https://example.com',
        },
      };

      apiCall.mockResolvedValue(loginResponse);

      // Mock successful poll response
      const mockPollResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          appPassword: 'test-password',
          loginName: 'test-user',
          server: 'https://example.com',
        }),
      };

      // Mock fetch for polling - return success on first call
      global.fetch = vi.fn().mockResolvedValue(mockPollResponse);

      // Mock chrome.tabs.create
      chrome.tabs.create.mockResolvedValue({ id: 123 });

      // Call openServerPage (which triggers loginPoll)
      const clickPromise = clickHandler();

      // Advance timers to complete the 1-second delay
      await vi.advanceTimersByTimeAsync(1000);

      // Wait for the click handler to complete
      await clickPromise;

      // Verify login tab was created
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://example.com/login',
      });

      // Verify polling fetch was called
      expect(global.fetch).toHaveBeenCalled();

      // Verify credentials were stored
      expect(store_data).toHaveBeenCalledWith('credentials', {
        appPassword: 'test-password',
        loginname: 'test-user',
        server: 'https://example.com',
      });

      vi.useRealTimers();
    });

    it('should handle max attempts and send message to background', async () => {
      // Mock setTimeout to speed up polling
      vi.useFakeTimers();

      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock successful API response
      apiCall.mockResolvedValue({
        login: 'https://example.com/login',
        poll: {
          endpoint: 'https://example.com/poll',
          token: 'test-token',
          value: 'https://example.com',
        },
      });

      // Mock failed poll response (not authorized)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      // Mock chrome.tabs.create
      chrome.tabs.create.mockResolvedValue({ id: 123 });

      // Call openServerPage
      const clickPromise = clickHandler();

      // Advance timers to complete all polling attempts
      // 300 attempts * 1 second = 300 seconds
      // We'll advance enough to reach maxAttempts
      for (let i = 0; i < 300; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      // Wait for the click handler to complete
      await clickPromise;

      // Verify chrome.runtime.sendMessage was called with maxAttempts
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'maxAttempts',
        loginPage: { id: 123 },
      });

      // Verify testServer button text was reset
      expect(mockElements.testServer.innerHTML).toBe('Open Login Page');

      // Verify serverName focus was called
      expect(mockElements.serverName.focus).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should handle server error response', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock API response with server error
      apiCall.mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
      });

      // Call openServerPage
      clickHandler();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify error message was displayed
      expect(mockElements.error.innerText).toBe('Login Server Error!');

      // Verify status message was displayed
      expect(mockElements.msg.innerText).toBe('401  - Unauthorized');

      // Verify testServer button text was reset
      expect(mockElements.testServer.innerHTML).toBe('Open Login Page');

      // Verify serverName focus was called
      expect(mockElements.serverName.focus).toHaveBeenCalled();
    });

    it('should handle server error with statusText only', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock API response with server error (no status)
      apiCall.mockResolvedValue({
        status: 0,
        statusText: 'Connection Error',
      });

      // Call openServerPage
      clickHandler();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify statusText message was displayed
      expect(mockElements.msg.innerText).toBe(' Connection Error');
    });
  });

  describe('serverError function', () => {
    it('should display error message with status code and reason phrase', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock API response with server error
      apiCall.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      // Call openServerPage
      clickHandler();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify error message
      expect(mockElements.error.innerText).toBe('Login Server Error!');

      // Verify status with reason phrase
      expect(mockElements.msg.innerText).toBe('404  - Not Found');
    });

    it('should handle 500 Internal Server Error', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock API response with 500 error
      apiCall.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Call openServerPage
      clickHandler();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify status with reason phrase
      expect(mockElements.msg.innerText).toBe('500  - Internal Server Error');
    });

    it('should handle unknown status codes', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock API response with unknown status code
      apiCall.mockResolvedValue({
        status: 999,
        statusText: 'Unknown',
      });

      // Call openServerPage
      clickHandler();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify unknown status handling
      expect(mockElements.msg.innerText).toBe('999  - Unknown Status');
    });
  });

  describe('Error handling', () => {
    it('should handle API call errors gracefully', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock API call failure
      apiCall.mockRejectedValue(new Error('Network error'));

      // Call openServerPage - should not throw
      await clickHandler();

      // Verify console.log was called with error
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle fetch errors during polling', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock successful API response
      apiCall.mockResolvedValue({
        login: 'https://example.com/login',
        poll: {
          endpoint: 'https://example.com/poll',
          token: 'test-token',
          value: 'https://example.com',
        },
      });

      // Mock fetch error during polling
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Mock chrome.tabs.create
      chrome.tabs.create.mockResolvedValue({ id: 123 });

      // Call openServerPage
      clickHandler();

      // Wait for polling attempts
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify console.log was called with error
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('getReasonPhrase function', () => {
    it('should return correct reason phrases for common status codes', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      const testCases = [
        { status: 200, expected: 'OK' },
        { status: 201, expected: 'Created' },
        { status: 400, expected: 'Bad Request' },
        { status: 401, expected: 'Unauthorized' },
        { status: 403, expected: 'Forbidden' },
        { status: 404, expected: 'Not Found' },
        { status: 500, expected: 'Internal Server Error' },
        { status: 502, expected: 'Bad Gateway' },
        { status: 503, expected: 'Service Unavailable' },
      ];

      for (const { status, expected } of testCases) {
        // Reset mocks
        vi.clearAllMocks();
        mockElements.msg.innerText = '';
        mockElements.error.innerText = '';
        mockElements.testServer.innerHTML = '';

        // Mock API response
        apiCall.mockResolvedValue({
          status,
          statusText: 'Test',
        });

        // Call openServerPage
        clickHandler();

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify reason phrase
        expect(mockElements.msg.innerText).toContain(expected);
      }
    });

    it('should return "Unknown Status" for unknown status codes', async () => {
      // Import and initialize
      await import('../src/login/login.js');
      await mockDocument.onreadystatechange();

      // Get the click handler
      const clickHandler = mockElements.testServer.addEventListener.mock.calls[0][1];

      // Mock API response with unknown status
      apiCall.mockResolvedValue({
        status: 999,
        statusText: 'Unknown',
      });

      // Call openServerPage
      clickHandler();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify unknown status handling
      expect(mockElements.msg.innerText).toContain('Unknown Status');
    });
  });
});
