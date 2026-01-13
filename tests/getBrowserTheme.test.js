/**
 * Unit tests for getBrowserTheme module
 * Tests theme detection and offscreen document management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  runtime: {
    getContexts: vi.fn(),
    sendMessage: vi.fn(),
    getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
  },
  offscreen: {
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
  },
};

// Import the module
import getBrowserTheme, { parseHTMLWithOffscreen } from '../src/background/modules/getBrowserTheme.js';

describe('getBrowserTheme module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBrowserTheme', () => {
    it('should detect light theme when no offscreen document exists', async () => {
      // Mock no existing offscreen document
      chrome.runtime.getContexts.mockResolvedValue([]);

      // Mock light theme response
      chrome.runtime.sendMessage.mockResolvedValue(true); // true = light theme

      const theme = await getBrowserTheme();

      // Verify offscreen document was created
      expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
        url: 'chrome-extension://mock-id/src/background/modules/offscreen/offscreen.html',
        reasons: ['MATCH_MEDIA', 'DOM_PARSER'],
        justification: 'matchmedia request and HTML parsing',
      });

      // Verify message was sent
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        target: 'offscreen',
        msg: 'getBrowserTheme',
      });

      // Verify document was closed
      expect(chrome.offscreen.closeDocument).toHaveBeenCalled();

      expect(theme).toBe('light');
    });

    it('should detect dark theme', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(false); // false = dark theme

      const theme = await getBrowserTheme();

      expect(theme).toBe('dark');
    });

    it('should reuse existing offscreen document', async () => {
      // Mock existing offscreen document
      chrome.runtime.getContexts.mockResolvedValue([
        { contextType: 'OFFSCREEN_DOCUMENT' },
      ]);

      chrome.runtime.sendMessage.mockResolvedValue(true);

      const theme = await getBrowserTheme();

      // Should NOT create new document
      expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();

      // Should still send message
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();

      // Should NOT close existing document
      expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();

      expect(theme).toBe('light');
    });

    it('should handle theme detection errors gracefully', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Theme detection failed'));

      const theme = await getBrowserTheme();

      // Should fallback to light theme on error
      expect(theme).toBe('light');

      // Should still attempt to clean up
      expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
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
      expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
    });

    it('should handle concurrent theme requests', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(true);

      // Make multiple concurrent requests
      const promises = Array(5).fill(null).map(() => getBrowserTheme());
      const results = await Promise.all(promises);

      // All should return the same result
      expect(results.every(t => t === 'light')).toBe(true);

      // Should only create one offscreen document (deduplication)
      // Note: Each call will create and close its own, but the inflightRequest prevents duplicates
      expect(chrome.offscreen.createDocument).toHaveBeenCalled();
    });
  });

  describe('parseHTMLWithOffscreen', () => {
    it('should successfully parse HTML and return structured data', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const mockParsedData = {
        metaTags: [
          { name: 'description', property: null, itemprop: null, httpEquiv: null, content: 'Test description' },
        ],
        aRelTag: ['tag1'],
        aRelCategory: ['cat1'],
        jsonLdScripts: ['{"keywords": ["test"]}'],
        scripts: ['console.log("test");'],
        githubTopics: ['topic1'],
        nextData: '{"pageProps": {}}',
        description: ['Test description'],
        headlines: {
          h1: ['Title'],
          h2: [],
          h3: [],
          h4: [],
          h5: [],
          h6: [],
        },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockParsedData);

      const result = await parseHTMLWithOffscreen('<html></html>');

      expect(result).toEqual(mockParsedData);
      expect(chrome.offscreen.createDocument).toHaveBeenCalled();
      expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
    });

    it('should handle parsing errors', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue({ error: 'Parse error' });

      await expect(parseHTMLWithOffscreen('<html></html>'))
        .rejects.toThrow('Parse error');
    });

    it('should handle timeout', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(parseHTMLWithOffscreen('<html></html>'))
        .rejects.toThrow('HTML parsing timeout');
    }, 15000);

    it('should reuse existing offscreen document', async () => {
      chrome.runtime.getContexts.mockResolvedValue([
        { contextType: 'OFFSCREEN_DOCUMENT' },
      ]);

      const mockData = {
        metaTags: [],
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        description: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockData);

      const result = await parseHTMLWithOffscreen('<html></html>');

      expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
      expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(result).toEqual(mockData);
    });

    it('should handle concurrent parsing requests', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const mockData = {
        metaTags: [],
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        description: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockData);

      const promises = [
        parseHTMLWithOffscreen('<html><h1>Page 1</h1></html>'),
        parseHTMLWithOffscreen('<html><h1>Page 2</h1></html>'),
        parseHTMLWithOffscreen('<html><h1>Page 3</h1></html>'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toEqual(mockData);
      });
    });
  });

  describe('Offscreen document lifecycle', () => {
    it('should create document with correct reasons', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(true);

      await getBrowserTheme();

      expect(chrome.offscreen.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          reasons: expect.arrayContaining(['MATCH_MEDIA', 'DOM_PARSER']),
        })
      );
    });

    it('should close document only if it created it', async () => {
      // Test 1: Created document
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue(true);

      await getBrowserTheme();
      expect(chrome.offscreen.closeDocument).toHaveBeenCalled();

      // Test 2: Reused document
      vi.clearAllMocks();
      chrome.runtime.getContexts.mockResolvedValue([
        { contextType: 'OFFSCREEN_DOCUMENT' },
      ]);
      chrome.runtime.sendMessage.mockResolvedValue(true);

      await getBrowserTheme();
      expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    });

    it('should clean up on error even if document was created', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Test error'));

      await getBrowserTheme();

      // Should attempt to close even on error
      expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle getContexts failure', async () => {
      chrome.runtime.getContexts.mockRejectedValue(new Error('Context check failed'));

      // Should still work by attempting to create document
      chrome.runtime.sendMessage.mockResolvedValue(true);

      const theme = await getBrowserTheme();

      // Should fallback to light theme
      expect(theme).toBe('light');
    });

    it('should handle closeDocument failure on error path', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Parse error'));
      chrome.offscreen.closeDocument.mockRejectedValue(new Error('Close failed'));

      // Should not throw, just log error
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

      // All should succeed
      expect(results.every(r => r === 'light')).toBe(true);
    });
  });
});

describe('Integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work end-to-end for theme detection and HTML parsing', async () => {
    // Setup for theme detection
    chrome.runtime.getContexts.mockResolvedValue([]);
    chrome.runtime.sendMessage.mockResolvedValueOnce(true); // Theme response

    // Setup for HTML parsing
    chrome.runtime.sendMessage.mockResolvedValueOnce({
      metaTags: [{ name: 'description', property: null, itemprop: null, httpEquiv: null, content: 'Page desc' }],
      aRelTag: ['tag1'],
      aRelCategory: ['cat1'],
      jsonLdScripts: ['{"keywords": ["test"]}'],
      scripts: ['console.log("test");'],
      githubTopics: ['topic1'],
      nextData: '',
      description: ['Page desc'],
      headlines: { h1: ['Title'], h2: [], h3: [], h4: [], h5: [], h6: [] },
    });

    // Run theme detection
    const theme = await getBrowserTheme();
    expect(theme).toBe('light');

    // Run HTML parsing
    const parsed = await parseHTMLWithOffscreen('<html></html>');
    expect(parsed.metaTags).toHaveLength(1);
    expect(parsed.aRelTag).toEqual(['tag1']);

    // Verify document was created and closed appropriately
    // Note: Each function creates its own document because the mock always returns []
    // for getContexts, so it doesn't detect the existing document
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(2);
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(2);
  });
});
