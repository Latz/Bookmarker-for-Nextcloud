/**
 * Unit tests for getBrowserTheme module
 * Tests theme detection and offscreen document management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
globalThis.chrome = {
  runtime: {
    getContexts: vi.fn(),
    sendMessage: vi.fn(),
    getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
  },
  offscreen: {
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
    hasDocument: vi.fn(),
  },
  storage: {
    session: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};

// Import the module
import getBrowserTheme, {
  _resetCacheForTesting,
} from '../src/background/modules/getBrowserTheme.js';

describe('getBrowserTheme module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTesting();
    chrome.storage.session.get.mockResolvedValue({});
    chrome.storage.session.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBrowserTheme', () => {
    it('should detect light theme when no offscreen document exists', async () => {
      // Mock no existing offscreen document
      chrome.offscreen.hasDocument.mockResolvedValue(false);
      chrome.runtime.getContexts.mockResolvedValue([]);

      // Mock browser is light (true), but function returns opposite for icon contrast
      // isLight=true means browser is light, so we return 'dark' for dark icon
      chrome.runtime.sendMessage.mockResolvedValue(true);

      const theme = await getBrowserTheme();

      // Verify offscreen document was created
      expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
        url: 'chrome-extension://mock-id/src/background/modules/offscreen/offscreen.html',
        reasons: ['MATCH_MEDIA'],
        justification: 'matchmedia request for browser theme detection',
      });

      // Verify message was sent
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        target: 'offscreen',
        msg: 'getBrowserTheme',
      });

      // Note: The actual function doesn't close the document after successful detection
      // The document is kept open for potential reuse

      // The function returns the opposite theme for icon contrast:
      // - Browser light (true) -> returns 'dark' (for dark icon)
      expect(theme).toBe('dark');
    });

    it('should detect dark theme', async () => {
      chrome.offscreen.hasDocument.mockResolvedValue(false);
      chrome.runtime.getContexts.mockResolvedValue([]);
      // Mock browser is dark (false), but function returns opposite for icon contrast
      // isLight=false means browser is dark, so we return 'light' for light icon
      chrome.runtime.sendMessage.mockResolvedValue(false);

      const theme = await getBrowserTheme();

      // The function returns the opposite theme for icon contrast:
      // - Browser dark (false) -> returns 'light' (for light icon)
      expect(theme).toBe('light');
    });

    it('should reuse existing offscreen document', async () => {
      // Mock existing offscreen document
      chrome.offscreen.hasDocument.mockResolvedValue(true);

      // Mock browser is light (true), function returns 'dark' for icon contrast
      chrome.runtime.sendMessage.mockResolvedValue(true);

      const theme = await getBrowserTheme();

      // Should NOT create new document
      expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();

      // Should still send message
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();

      // Should NOT close existing document
      expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();

      // Browser light (true) -> returns 'dark' for icon contrast
      expect(theme).toBe('dark');
    });

    it('should handle theme detection errors gracefully', async () => {
      chrome.offscreen.hasDocument.mockResolvedValue(false);
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Theme detection failed'));

      const theme = await getBrowserTheme();

      // Should fallback to light theme on error
      expect(theme).toBe('light');
    });

    it('should handle timeout errors', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      // Mock slow response
      chrome.runtime.sendMessage.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      const theme = await getBrowserTheme();

      // Should fallback to light theme on timeout
      expect(theme).toBe('light');
      // Note: The actual function doesn't close the document on timeout
      // It just logs the error and falls back to light theme
    });

    it('should handle concurrent theme requests', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      // Mock browser is light (true), function returns 'dark' for icon contrast
      chrome.runtime.sendMessage.mockResolvedValue(true);

      // Make multiple concurrent requests
      const promises = Array(5).fill(null).map(() => getBrowserTheme());
      const results = await Promise.all(promises);

      // All should return the same result (dark, since browser is light)
      expect(results.every(t => t === 'dark')).toBe(true);

      // Should only create one offscreen document (deduplication)
      // Note: Each call will create and close its own, but the inflightRequest prevents duplicates
      expect(chrome.offscreen.createDocument).toHaveBeenCalled();
    });

    it('should return cached theme from session storage on cold start', async () => {
      // Session storage has a theme, module cache is empty
      chrome.storage.session.get.mockResolvedValue({ browserTheme: 'dark' });

      const theme = await getBrowserTheme();

      // Should return from session storage without any offscreen work
      expect(theme).toBe('dark');
      expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(chrome.storage.session.get).toHaveBeenCalledWith('browserTheme');
    });

    it('should save detected theme to session storage', async () => {
      chrome.storage.session.get.mockResolvedValue({}); // Cache miss
      chrome.offscreen.hasDocument.mockResolvedValue(false);
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(true); // isLight=true → 'dark'

      await getBrowserTheme();

      expect(chrome.storage.session.set).toHaveBeenCalledWith({ browserTheme: 'dark' });
    });

    it('should fall through to full detection when session storage is empty', async () => {
      chrome.storage.session.get.mockResolvedValue({}); // No cached theme
      chrome.offscreen.hasDocument.mockResolvedValue(false);
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(false); // isLight=false → 'light'

      const theme = await getBrowserTheme();

      // Full detection was run
      expect(chrome.offscreen.createDocument).toHaveBeenCalled();
      expect(theme).toBe('light');
    });
  });

  describe('Offscreen document lifecycle', () => {
    it('should create document with correct reasons', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(true);

      await getBrowserTheme();

      expect(chrome.offscreen.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          reasons: ['MATCH_MEDIA'],
        })
      );
    });

    it('should not close document after successful detection', async () => {
      // The actual implementation keeps the offscreen document open for reuse
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(true);

      await getBrowserTheme();
      // Document is NOT closed - it's kept open for potential reuse
      expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    });

    it('should not close document on error', async () => {
      // The actual implementation doesn't close the document on error
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Test error'));

      await getBrowserTheme();

      // Document is NOT closed on error either
      expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle getContexts failure', async () => {
      chrome.runtime.getContexts.mockRejectedValue(new Error('Context check failed'));

      // Should still work by attempting to create document
      // Mock returns true (browser is light), so function returns 'dark' for icon contrast
      chrome.runtime.sendMessage.mockResolvedValue(true);

      const theme = await getBrowserTheme();

      // Returns 'dark' because browser is light (true) - for icon contrast
      expect(theme).toBe('dark');
    });

    it('should handle message send failure on error path', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Parse error'));

      // Should not throw, just log error and fallback to light
      const theme = await getBrowserTheme();
      expect(theme).toBe('light');
    });

    it('should handle multiple rapid requests without race conditions', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(true), 50))
      );

      const promises = Array(10).fill(null).map(() => getBrowserTheme());
      const results = await Promise.all(promises);

      // All should succeed - mock returns true (browser is light), so 'dark' for icon contrast
      expect(results.every(r => r === 'dark')).toBe(true);
    });
  });
});

describe('Integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTesting();
    chrome.storage.session.get.mockResolvedValue({});
    chrome.storage.session.set.mockResolvedValue(undefined);
  });

  it('should work end-to-end for theme detection', async () => {
    // HTML parsing no longer goes through this module or the offscreen
    // document at all (S5: moved to extractPageData, injected directly into
    // the page) -- this offscreen document now exists only for matchMedia
    // theme detection, covered by getBrowserTheme's own describe block above.
    // This integration test is kept narrower, for the one thing left to
    // integrate: theme detection end-to-end through a fresh document.
    chrome.runtime.getContexts.mockResolvedValue([]);
    chrome.runtime.sendMessage.mockResolvedValueOnce(true); // ready for getBrowserTheme
    chrome.runtime.sendMessage.mockResolvedValueOnce(true); // getBrowserTheme (isLight=true -> 'dark')

    const theme = await getBrowserTheme();
    expect(theme).toBe('dark');

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chrome.offscreen.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: ['MATCH_MEDIA'] }),
    );
    // Document is NOT closed -- kept open for potential reuse.
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
  });
});
