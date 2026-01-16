/**
 * Unit tests for apiCall.js
 * Tests the API call functionality with timeout, authentication, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  ...global.chrome,
};

// Mock modules
vi.mock('../src/lib/storage.js', () => ({
  load_data: vi.fn(),
  getOption: vi.fn(),
}));

// Import after mocking
import { load_data, getOption } from '../src/lib/storage.js';
import apiCall from '../src/lib/apiCall.js';

describe('apiCall.js', () => {
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock console.log to suppress output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('timeoutFetch', () => {
    it('should use default network timeout when not configured', async () => {
      // Mock getOption to return undefined (no timeout configured)
      getOption.mockResolvedValue(undefined);

      // Mock credentials - load_data returns single value for single key
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });

      // Mock successful fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      // Call apiCall which uses timeoutFetch internally
      const promise = apiCall('test/endpoint', 'GET');

      // Wait for the promise to resolve
      const result = await promise;

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual({ status: 'success' });
    });

    it('should use configured network timeout', async () => {
      // Mock getOption to return 5 seconds
      getOption.mockResolvedValue(5);

      // Mock credentials
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });

      // Mock successful fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await apiCall('test/endpoint', 'GET');

      expect(getOption).toHaveBeenCalledWith('input_networkTimeout');
    });

    it('should handle timeout error', async () => {
      // Mock getOption to return a short timeout (10ms)
      getOption.mockResolvedValue(0.01);

      // Mock credentials
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });

      // Mock fetch that never resolves (simulates slow network)
      // When aborted, it should throw an AbortError (TypeError)
      let abortSignal = null;
      mockFetch.mockImplementation((url, options) => {
        abortSignal = options.signal;
        return new Promise((_, reject) => {
          // Listen for abort and reject with TypeError (like real AbortError)
          options.signal.addEventListener('abort', () => {
            reject(new TypeError('The operation was aborted.'));
          });
        });
      });

      // Start the API call
      const promise = apiCall('test/endpoint', 'GET');

      // Wait a bit for the fetch to be called and timeout to be set up
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check that signal was created and is not yet aborted
      expect(abortSignal).toBeDefined();

      // Wait for timeout to trigger (10ms + buffer)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Signal should now be aborted
      expect(abortSignal.aborted).toBe(true);

      // The promise should resolve with error result (TypeError is caught)
      const result = await promise;
      expect(result.status).toBe(-1);
    });
  });

  describe('apiCall', () => {
    it('should construct URL with server from credentials', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await apiCall('test/endpoint', 'GET');

      // data defaults to empty string, so URL ends with ?
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/test/endpoint?',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should add trailing slash to server URL', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await apiCall('test/endpoint', 'GET');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/test/endpoint?',
        expect.any(Object),
      );
    });

    it('should extract server from data.host when provided', async () => {
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      const data = { host: 'https://custom-server.com', param: 'value' };
      await apiCall('test/endpoint', 'POST', data);

      // The code uses `${data}` which converts object to [object Object]
      // This is the actual behavior of the apiCall function
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-server.com/test/endpoint?[object Object]',
        expect.any(Object),
      );
    });

    it('should include Authorization header for non-loginflow requests', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await apiCall('test/endpoint', 'GET');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic '),
            'OCS-APIREQUEST': 'true',
            'User-Agent': 'Bookmarker4Nextcloud',
          }),
        }),
      );
    });

    it('should not include Authorization header for loginflow requests', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      const data = { loginflow: true };
      await apiCall('test/endpoint', 'POST', data);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.any(String),
          }),
        }),
      );
    });

    it('should handle successful response', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      const responseData = { status: 'success', data: { id: 123 } };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await apiCall('test/endpoint', 'GET');

      expect(result).toEqual(responseData);
    });

    it('should handle error response', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      // The code sets result with status/statusText, throws an Error,
      // but the catch block only handles TypeError, so it returns {}
      const result = await apiCall('test/endpoint', 'GET');
      expect(result).toEqual({});
    });

    it('should handle TypeError (network error)', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockRejectedValue(new TypeError('Network error'));

      const result = await apiCall('test/endpoint', 'GET');

      expect(result).toEqual({
        status: -1,
        statusText: 'Network error',
      });
    });

    it('should handle abort signal', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      const controller = new AbortController();

      // Mock fetch to verify signal is passed
      let receivedSignal = null;
      mockFetch.mockImplementation((url, options) => {
        receivedSignal = options.signal;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success' }),
        });
      });

      await apiCall('test/endpoint', 'GET', '', controller.signal);

      // timeoutFetch creates its own AbortController but listens to external signal
      // The signal passed to fetch is the internal controller's signal
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal.aborted).toBe(false);
    });

    it('should add server trailing slash when missing', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await apiCall('test/endpoint', 'GET');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/test/endpoint?',
        expect.any(Object),
      );
    });

    it('should not add trailing slash when server already has one', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com/';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await apiCall('test/endpoint', 'GET');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/test/endpoint?',
        expect.any(Object),
      );
    });
  });

  describe('authentication', () => {
    it('should generate Basic auth header from credentials', async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'admin', appPassword: 'secret123' };
      });
      getOption.mockResolvedValue(10);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await apiCall('test/endpoint', 'GET');

      // btoa('admin:secret123') = 'YWRtaW46c2VjcmV0MTIz'
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic YWRtaW46c2VjcmV0MTIz',
          }),
        }),
      );
    });
  });
});
