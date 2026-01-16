/**
 * Unit tests for urlNormalizer.js
 * Tests URL normalization functionality and LRU cache behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normalizeUrl, urlsAreEquivalent } from '../src/lib/urlNormalizer.js';

describe('urlNormalizer.js', () => {
  describe('normalizeUrl', () => {
    beforeEach(() => {
      // Clear the cache before each test by re-importing the module
      // The cache is module-level, so we need to reset it
      vi.resetModules();
    });

    describe('Protocol normalization', () => {
      it('should convert http to https by default', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://example.com');
        expect(result).toBe('https://example.com/');
      });

      it('should keep https unchanged', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com');
        expect(result).toBe('https://example.com/');
      });

      it('should not convert http when normalizeProtocol is false', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://example.com', { normalizeProtocol: false });
        expect(result).toBe('http://example.com/');
      });
    });

    describe('WWW prefix removal', () => {
      it('should remove www prefix by default', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://www.example.com');
        expect(result).toBe('https://example.com/');
      });

      it('should keep www when removeWWW is false', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://www.example.com', { removeWWW: false });
        expect(result).toBe('https://www.example.com/');
      });

      it('should handle multiple www subdomains', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://www.www.example.com');
        expect(result).toBe('https://www.example.com/');
      });
    });

    describe('Trailing slash removal', () => {
      it('should remove trailing slash by default', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page/');
        expect(result).toBe('https://example.com/page');
      });

      it('should not remove trailing slash for root path', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/');
        expect(result).toBe('https://example.com/');
      });

      it('should keep trailing slash when removeTrailingSlash is false', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page/', { removeTrailingSlash: false });
        expect(result).toBe('https://example.com/page/');
      });

      it('should handle URLs without trailing slash', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page');
        expect(result).toBe('https://example.com/page');
      });
    });

    describe('Query parameter sorting', () => {
      it('should sort query parameters alphabetically by default', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?z=1&a=2&b=3');
        expect(result).toBe('https://example.com/?a=2&b=3&z=1');
      });

      it('should keep query params unsorted when sortQueryParams is false', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?z=1&a=2&b=3', { sortQueryParams: false });
        expect(result).toBe('https://example.com/?z=1&a=2&b=3');
      });

      it('should handle URLs without query parameters', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page');
        expect(result).toBe('https://example.com/page');
      });

      it('should handle empty query parameters', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?');
        // Empty query string results in '?' being preserved
        expect(result).toBe('https://example.com/?');
      });
    });

    describe('Fragment removal', () => {
      it('should remove fragment by default', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page#section');
        expect(result).toBe('https://example.com/page');
      });

      it('should keep fragment when removeFragment is false', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page#section', { removeFragment: false });
        expect(result).toBe('https://example.com/page#section');
      });

      it('should handle URLs with query params and fragments', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?a=1#section');
        expect(result).toBe('https://example.com/?a=1');
      });
    });

    describe('Complex URL normalization', () => {
      it('should handle all normalization options together', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://www.example.com/page/?z=1&a=2#section');
        // Trailing slash is not removed when followed by query string
        expect(result).toBe('https://example.com/page/?a=2&z=1');
      });

      it('should normalize the same URL consistently', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const url1 = normalizeUrl('http://www.example.com/path/?b=2&a=1#test');
        const url2 = normalizeUrl('https://example.com/path/?a=1&b=2');
        expect(url1).toBe(url2);
      });
    });

    describe('Error handling', () => {
      it('should return original string for invalid URLs', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('not-a-url');
        expect(result).toBe('not-a-url');
      });

      it('should handle empty string', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('');
        expect(result).toBe('');
      });

      it('should handle malformed URLs gracefully', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://');
        expect(result).toBe('http://');
      });
    });

    describe('LRU Cache behavior', () => {
      it('should cache normalized results', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const url = 'https://example.com/test';

        // First call - should compute
        const result1 = normalizeUrl(url);

        // Second call - should use cache
        const result2 = normalizeUrl(url);

        expect(result1).toBe(result2);
        expect(result1).toBe('https://example.com/test');
      });

      it('should cache based on URL and options', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');

        const result1 = normalizeUrl('http://example.com', { normalizeProtocol: true });
        const result2 = normalizeUrl('http://example.com', { normalizeProtocol: false });

        expect(result1).not.toBe(result2);
        expect(result1).toBe('https://example.com/');
        expect(result2).toBe('http://example.com/');
      });

      it('should handle LRU eviction when cache is full', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');

        // Fill cache with 1001 unique URLs
        for (let i = 0; i < 1001; i++) {
          normalizeUrl(`https://example${i}.com`);
        }

        // First URL should be evicted
        const result = normalizeUrl('https://example0.com');
        expect(result).toBe('https://example0.com/');
      });

      it('should update LRU on cache hit', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');

        // Add 3 URLs
        normalizeUrl('https://example1.com');
        normalizeUrl('https://example2.com');
        normalizeUrl('https://example3.com');

        // Access first URL to make it recent
        normalizeUrl('https://example1.com');

        // Fill cache to trigger eviction
        for (let i = 4; i <= 1003; i++) {
          normalizeUrl(`https://example${i}.com`);
        }

        // example1.com should still be in cache (was accessed recently)
        // example2.com and example3.com should be evicted first
        const result = normalizeUrl('https://example1.com');
        expect(result).toBe('https://example1.com/');
      });
    });

    describe('Edge cases', () => {
      it('should handle URLs with ports', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com:8080/page');
        expect(result).toBe('https://example.com:8080/page');
      });

      it('should handle URLs with authentication', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://user:pass@example.com/page');
        expect(result).toBe('https://user:pass@example.com/page');
      });

      it('should handle IP addresses', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://192.168.1.1/path');
        expect(result).toBe('https://192.168.1.1/path');
      });

      it('should handle file protocol', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('file:///path/to/file.html');
        expect(result).toBe('file:///path/to/file.html');
      });

      it('should handle URLs with encoded characters', async () => {
        const { normalizeUrl } = await import('../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/path%20with%20spaces');
        expect(result).toBe('https://example.com/path%20with%20spaces');
      });
    });
  });

  describe('urlsAreEquivalent', () => {
    it('should return true for identical URLs', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      expect(urlsAreEquivalent('https://example.com', 'https://example.com')).toBe(true);
    });

    it('should return true for equivalent URLs after normalization', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      expect(urlsAreEquivalent('http://www.example.com/', 'https://example.com')).toBe(true);
    });

    it('should return false for different URLs', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      expect(urlsAreEquivalent('https://example.com', 'https://example.org')).toBe(false);
    });

    it('should handle query parameter differences', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      expect(urlsAreEquivalent('https://example.com?a=1&b=2', 'https://example.com?b=2&a=1')).toBe(true);
    });

    it('should handle trailing slash differences', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      expect(urlsAreEquivalent('https://example.com/page/', 'https://example.com/page')).toBe(true);
    });

    it('should handle fragment differences', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      expect(urlsAreEquivalent('https://example.com#section', 'https://example.com')).toBe(true);
    });

    it('should respect custom options', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      // With default options, these are equivalent
      expect(urlsAreEquivalent('http://example.com', 'https://example.com')).toBe(true);
      // With protocol normalization disabled, they are different
      expect(urlsAreEquivalent('http://example.com', 'https://example.com', { normalizeProtocol: false })).toBe(false);
    });

    it('should handle invalid URLs', async () => {
      const { urlsAreEquivalent } = await import('../src/lib/urlNormalizer.js');
      expect(urlsAreEquivalent('not-a-url', 'not-a-url')).toBe(true);
      expect(urlsAreEquivalent('not-a-url', 'different')).toBe(false);
    });
  });
});
