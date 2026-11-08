// @vitest-environment node
/**
 * Unit tests for urlNormalizer.js
 * Tests URL normalization functionality and LRU cache behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeUrl } from '../../src/lib/urlNormalizer.js';

describe('urlNormalizer.js', () => {
  describe('normalizeUrl', () => {
    beforeEach(() => {
      // Clear the cache before each test by re-importing the module
      // The cache is module-level, so we need to reset it
      vi.resetModules();
    });

    describe('Protocol normalization', () => {
      it('should convert http to https by default', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://example.com');
        expect(result).toBe('https://example.com/');
      });

      it('should keep https unchanged', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com');
        expect(result).toBe('https://example.com/');
      });

      it('should not convert http when normalizeProtocol is false', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://example.com', {
          normalizeProtocol: false,
        });
        expect(result).toBe('http://example.com/');
      });
    });

    describe('Protocol normalization (non-http)', () => {
      it('should leave other protocols unchanged', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        expect(normalizeUrl('ftp://example.com/file')).toBe(
          'ftp://example.com/file',
        );
      });
    });

    describe('WWW prefix removal', () => {
      it('should remove www prefix by default', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://www.example.com');
        expect(result).toBe('https://example.com/');
      });

      it('should keep www when removeWWW is false', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://www.example.com', {
          removeWWW: false,
        });
        expect(result).toBe('https://www.example.com/');
      });

      it('should handle multiple www subdomains', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://www.www.example.com');
        expect(result).toBe('https://www.example.com/');
      });
    });

    describe('Trailing slash removal', () => {
      it('should remove trailing slash by default', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page/');
        expect(result).toBe('https://example.com/page');
      });

      it('should not remove trailing slash for root path', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/');
        expect(result).toBe('https://example.com/');
      });

      it('should keep trailing slash when removeTrailingSlash is false', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page/', {
          removeTrailingSlash: false,
        });
        expect(result).toBe('https://example.com/page/');
      });

      it('should handle URLs without trailing slash', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page');
        expect(result).toBe('https://example.com/page');
      });
    });

    describe('Query parameter sorting', () => {
      it('should sort query parameters alphabetically by default', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?z=1&a=2&b=3');
        expect(result).toBe('https://example.com/?a=2&b=3&z=1');
      });

      it('should keep query params unsorted when sortQueryParams is false', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?z=1&a=2&b=3', {
          sortQueryParams: false,
        });
        expect(result).toBe('https://example.com/?z=1&a=2&b=3');
      });

      it('should handle URLs without query parameters', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page');
        expect(result).toBe('https://example.com/page');
      });

      it('should handle empty query parameters', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?');
        // Empty query string results in '?' being preserved
        expect(result).toBe('https://example.com/?');
      });
    });

    describe('Fragment removal', () => {
      it('should remove fragment by default', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page#section');
        expect(result).toBe('https://example.com/page');
      });

      it('should keep fragment when removeFragment is false', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/page#section', {
          removeFragment: false,
        });
        expect(result).toBe('https://example.com/page#section');
      });

      it('should handle URLs with query params and fragments', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com?a=1#section');
        expect(result).toBe('https://example.com/?a=1');
      });
    });

    describe('Complex URL normalization', () => {
      it('should handle all normalization options together', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl(
          'http://www.example.com/page/?z=1&a=2#section',
        );
        // Trailing slash is not removed when followed by query string
        expect(result).toBe('https://example.com/page/?a=2&z=1');
      });

      it('should normalize the same URL consistently', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const url1 = normalizeUrl('http://www.example.com/path/?b=2&a=1#test');
        const url2 = normalizeUrl('https://example.com/path/?a=1&b=2');
        expect(url1).toBe(url2);
      });
    });

    describe('Error handling', () => {
      it('should return original string for invalid URLs', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('not-a-url');
        expect(result).toBe('not-a-url');
      });

      it('should handle empty string', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('');
        expect(result).toBe('');
      });

      it('should handle malformed URLs gracefully', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://');
        expect(result).toBe('http://');
      });

      it('should warn when parsing fails', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        normalizeUrl('not-a-url');
        expect(warn).toHaveBeenCalledWith(
          'URL normalization failed:',
          expect.any(TypeError),
        );
        warn.mockRestore();
      });
    });

    describe('LRU Cache behavior', () => {
      // The cache is only observable by whether the URL is parsed again,
      // so count URL constructions.
      let parses;
      beforeEach(() => {
        parses = 0;
        const RealURL = globalThis.URL;
        vi.stubGlobal(
          'URL',
          class extends RealURL {
            constructor(...args) {
              parses++;
              super(...args);
            }
          },
        );
      });
      afterEach(() => vi.unstubAllGlobals());

      const isCached = (normalizeUrl, url) => {
        const before = parses;
        normalizeUrl(url);
        return parses === before;
      };

      it('should not re-parse a cached URL', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        expect(isCached(normalizeUrl, 'https://example.com/test')).toBe(false);
        expect(isCached(normalizeUrl, 'https://example.com/test')).toBe(true);
        expect(normalizeUrl('https://example.com/test')).toBe(
          'https://example.com/test',
        );
      });

      it('should cache based on URL and options', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');

        const result1 = normalizeUrl('http://example.com', {
          normalizeProtocol: true,
        });
        const before = parses;
        const result2 = normalizeUrl('http://example.com', {
          normalizeProtocol: false,
        });

        expect(result1).toBe('https://example.com/');
        expect(result2).toBe('http://example.com/');
        expect(parses).toBeGreaterThan(before);
      });

      it('should evict exactly the oldest entry beyond 1000', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        for (let i = 0; i <= 1000; i++) normalizeUrl(`https://example${i}.com`);

        expect(isCached(normalizeUrl, 'https://example1.com')).toBe(true);
        expect(isCached(normalizeUrl, 'https://example1000.com')).toBe(true);
        expect(isCached(normalizeUrl, 'https://example0.com')).toBe(false);
      });

      it('should move a cache hit to the newest position', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        for (let i = 0; i < 1000; i++) normalizeUrl(`https://example${i}.com`);

        normalizeUrl('https://example0.com'); // hit: now newest
        normalizeUrl('https://new.com'); // evicts the oldest, example1

        expect(isCached(normalizeUrl, 'https://example0.com')).toBe(true);
        expect(isCached(normalizeUrl, 'https://example1.com')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle URLs with ports', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com:8080/page');
        expect(result).toBe('https://example.com:8080/page');
      });

      it('should handle URLs with authentication', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://user:pass@example.com/page');
        expect(result).toBe('https://user:pass@example.com/page');
      });

      it('should handle IP addresses', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('http://192.168.1.1/path');
        expect(result).toBe('https://192.168.1.1/path');
      });

      it('should handle file protocol', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('file:///path/to/file.html');
        expect(result).toBe('file:///path/to/file.html');
      });

      it('should handle URLs with encoded characters', async () => {
        const { normalizeUrl } = await import('../../src/lib/urlNormalizer.js');
        const result = normalizeUrl('https://example.com/path%20with%20spaces');
        expect(result).toBe('https://example.com/path%20with%20spaces');
      });
    });
  });
});
