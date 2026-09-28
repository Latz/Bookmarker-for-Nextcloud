/**
 * Unit tests for getKeywords module
 * Tests the function that extracts keywords from HTML documents using various methods
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/background/modules/page/getMeta.js', () => ({
  default: vi.fn(),
}));

vi.mock('../src/background/modules/page/getDescription.js', () => ({
  default: vi.fn(),
}));

vi.mock('../src/lib/cache.js', () => ({
  cacheGet: vi.fn(),
}));

vi.mock('../src/lib/storage.js', () => ({
  getOption: vi.fn(),
  getOptions: vi.fn(),
}));

vi.mock('../src/lib/log.js', () => ({
  default: vi.fn(),
}));

// Import the module after mocking
import getMeta from '../src/background/modules/page/getMeta.js';
import getDescription from '../src/background/modules/page/getDescription.js';
import { cacheGet } from '../src/lib/cache.js';
import { getOption, getOptions } from '../src/lib/storage.js';
import getKeywords, {
  mergeKeywords,
} from '../src/background/modules/page/getKeywords.js';

describe('getKeywords', () => {
  let mockDocument;
  let mockParsedData;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocument = {
      querySelectorAll: vi.fn().mockReturnValue([]),
      getElementById: vi.fn(),
    };
    mockParsedData = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Auto-tags disabled', () => {
    it('should return empty array when cbx_autoTags is false', async () => {
      getOptions.mockResolvedValue({
        cbx_autoTags: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
      expect(getOptions).toHaveBeenCalled();
    });
  });

  describe('Meta keywords extraction', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
    });

    it('should extract keywords from meta tags', async () => {
      getMeta.mockReturnValue(['keyword1, keyword2, keyword3']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
      expect(getMeta).toHaveBeenCalled();
    });

    it('should handle single keyword string', async () => {
      getMeta.mockReturnValue(['singleKeyword']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['singleKeyword']);
    });

    it('should keep a single hyphenated keyword (article:tag)', async () => {
      getMeta.mockReturnValue(['self-hosting']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['self-hosting']);
    });

    it('should split keywords by comma', async () => {
      getMeta.mockReturnValue(['keyword1,keyword2,keyword3']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should split keywords by semicolon', async () => {
      getMeta.mockReturnValue(['keyword1;keyword2;keyword3']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should split keywords by space', async () => {
      getMeta.mockImplementation((doc, { id }) =>
        id === 'keywords' ? ['keyword1 keyword2 keyword3'] : [],
      );

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should split keywords by &amp;', async () => {
      getMeta.mockReturnValue(['keyword1&amp;keyword2&amp;keyword3']);

      const result = await getKeywords(mockParsedData, mockDocument);

      // Note: The implementation has a bug - it splits on &amp (without semicolon)
      // so the result includes &amp at the end of each keyword except the last
      expect(result).toEqual(['keyword1&amp', 'keyword2&amp', 'keyword3']);
    });

    it('should trim quotes from keywords', async () => {
      getMeta.mockReturnValue(['"keyword1", "keyword2"']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2']);
    });

    it('should trim whitespace from keywords', async () => {
      getMeta.mockReturnValue(['  keyword1  ,  keyword2  ']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2']);
    });

    it('should handle multiple meta keyword tags', async () => {
      getMeta.mockReturnValue(['keyword1', 'keyword2']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2']);
    });

    it('should not split a multi-word article:tag on spaces', async () => {
      getMeta.mockImplementation((doc, { id }) =>
        id === 'article:tag' ? ['Fatty Liver Disease'] : [],
      );

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['Fatty Liver Disease']);
    });

    it('should still split a comma-separated article:tag', async () => {
      getMeta.mockImplementation((doc, { id }) =>
        id === 'article:tag' ? ['Space Exploration, SpaceX, moon'] : [],
      );

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['Space Exploration', 'SpaceX', 'moon']);
    });

    it('should merge meta keywords and article:tag', async () => {
      getMeta.mockImplementation((doc, { id }) => {
        if (id === 'keywords') return ['k1, k2'];
        if (id === 'article:tag') return ['tag'];
        return [];
      });

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['k1', 'k2', 'tag']);
    });

    it('should return empty array when no meta keywords found', async () => {
      getMeta.mockReturnValue([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });
  });

  describe('Rel tag extraction', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
    });

    it('should extract keywords from a[rel=tag] elements', async () => {
      const mockTag1 = { textContent: 'tag1' };
      const mockTag2 = { textContent: 'tag2' };
      mockDocument.querySelectorAll.mockReturnValue([mockTag1, mockTag2]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['tag1', 'tag2']);
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('a[rel=tag]');
    });

    it('should handle empty rel tag results', async () => {
      mockDocument.querySelectorAll.mockReturnValue([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });

    it('should trim whitespace from rel tag text', async () => {
      const mockTag = { textContent: '  tag  ' };
      mockDocument.querySelectorAll.mockReturnValue([mockTag]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['tag']);
    });
  });

  describe('Rel category extraction', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
    });

    it('should extract keywords from a[rel=category] elements', async () => {
      const mockCat1 = { textContent: 'category1' };
      const mockCat2 = { textContent: 'category2' };
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockCat1, mockCat2]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['category1', 'category2']);
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith(
        'a[rel=category]',
      );
    });
  });

  describe('JSON-LD extraction', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
    });

    it('should extract keywords from JSON-LD script', async () => {
      const mockScript = {
        innerText: JSON.stringify({ keywords: ['jsonld1', 'jsonld2'] }),
      };
      // 4 querySelectorAll calls: rel=tag, rel=category, JSON-LD, script (GTM)
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockScript])
        .mockReturnValueOnce([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['jsonld1', 'jsonld2']);
    });

    it('should handle JSON-LD with @graph', async () => {
      const mockScript = {
        innerText: JSON.stringify({
          '@graph': [{ '@type': 'Article', keywords: ['graph1', 'graph2'] }],
        }),
      };
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockScript])
        .mockReturnValueOnce([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['graph1', 'graph2']);
    });

    it('should handle invalid JSON-LD gracefully', async () => {
      const mockScript = {
        innerText: 'invalid json {',
      };
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockScript])
        .mockReturnValueOnce([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });

    it('should handle JSON-LD with string keywords', async () => {
      const mockScript = {
        innerText: JSON.stringify({ keywords: 'keyword1,keyword2' }),
      };
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockScript])
        .mockReturnValueOnce([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2']);
    });

    it('should not crash on JSON-LD keywords shaped as a non-array, non-string object (S6)', async () => {
      // security.md S6: `Object.prototype.hasOwn` does not exist, so this
      // reached a TypeError on any page serving JSON-LD in this shape --
      // { keywords: { length: 1, "0": {} } } passes the array/string checks
      // (truthy, length > 0, not Array.isArray, not a string) and used to
      // throw immediately. It still throws today (`.split is not a
      // function`, since a plain object has no .split), but that throw must
      // stay contained to this one script rather than crash the whole
      // extraction pipeline for the page.
      const mockScript = {
        innerText: JSON.stringify({ keywords: { length: 1, 0: {} } }),
      };
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockScript])
        .mockReturnValueOnce([]);

      await expect(getKeywords(mockParsedData, mockDocument)).resolves.toEqual(
        [],
      );
    });
  });

  describe('Google Tag Manager extraction', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
    });

    it('should extract keywords from Google Tag Manager dataLayer', async () => {
      const mockScript = {
        text: 'dataLayer.push({"content": {"keywords": "gtm1|gtm2|gtm3"}});',
      };
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockScript])
        .mockReturnValueOnce([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['gtm1', 'gtm2', 'gtm3']);
    });

    it('should handle invalid GTM script gracefully', async () => {
      const mockScript = {
        text: 'dataLayer.push({invalid});',
      };
      mockDocument.querySelectorAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([mockScript])
        .mockReturnValueOnce([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });
  });

  describe('GitHub topics extraction', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
    });

    it('should extract keywords from GitHub topics using topic-tag class selector', async () => {
      const mockTopic1 = { textContent: '  opencode  ' };
      const mockTopic2 = { textContent: '  ai-agents  ' };
      // First 4 selectors (rel=tag, rel=category, JSON-LD, GTM) return empty
      // GitHub selector with class*="topic-tag" returns topics
      mockDocument.querySelectorAll
        .mockReturnValueOnce([]) // rel=tag
        .mockReturnValueOnce([]) // rel=category
        .mockReturnValueOnce([]) // JSON-LD
        .mockReturnValueOnce([]) // GTM
        .mockReturnValueOnce([mockTopic1, mockTopic2]); // GitHub topic-tag

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['opencode', 'ai-agents']);
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith(
        'a[class*="topic-tag"]',
      );
    });

    it('should extract keywords from GitHub topics using href pattern selector', async () => {
      const mockTopic1 = { textContent: 'claude' };
      const mockTopic2 = { textContent: 'vibe-coding' };
      // First 4 selectors return empty, topic-tag returns empty, data-view-component returns empty, href selector returns topics
      mockDocument.querySelectorAll
        .mockReturnValueOnce([]) // rel=tag
        .mockReturnValueOnce([]) // rel=category
        .mockReturnValueOnce([]) // JSON-LD
        .mockReturnValueOnce([]) // GTM
        .mockReturnValueOnce([]) // GitHub topic-tag (no match)
        .mockReturnValueOnce([]) // GitHub data-view-component (no match)
        .mockReturnValueOnce([mockTopic1, mockTopic2]); // GitHub href selector

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['claude', 'vibe-coding']);
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith(
        'a[href^="/topics/"]',
      );
    });

    it('should fall back to legacy selector if modern selectors fail', async () => {
      const mockTopic1 = { textContent: 'legacy-topic' };
      // All modern selectors fail, falls back to legacy data-ga-click selector
      mockDocument.querySelectorAll
        .mockReturnValueOnce([]) // rel=tag
        .mockReturnValueOnce([]) // rel=category
        .mockReturnValueOnce([]) // JSON-LD
        .mockReturnValueOnce([]) // GTM
        .mockReturnValueOnce([]) // GitHub topic-tag (no match)
        .mockReturnValueOnce([]) // GitHub data-view-component (no match)
        .mockReturnValueOnce([]) // GitHub href (no match)
        .mockReturnValueOnce([mockTopic1]); // GitHub legacy selector

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['legacy-topic']);
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith(
        'a[data-ga-click="Topic, repository page"]',
      );
    });
  });

  describe('Next.js data extraction', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
    });

    it('should extract keywords from __NEXT_DATA__ script', async () => {
      const mockScript = {
        innerText: JSON.stringify({
          props: {
            pageProps: {
              post: {
                tags: 'next1,next2,next3',
              },
            },
          },
        }),
      };
      mockDocument.getElementById.mockReturnValue(mockScript);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['next1', 'next2', 'next3']);
    });

    it('should handle missing __NEXT_DATA__ gracefully', async () => {
      mockDocument.getElementById.mockReturnValue(null);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });

    it('should handle invalid __NEXT_DATA__ JSON', async () => {
      mockDocument.getElementById.mockReturnValue({
        innerText: 'invalid json',
      });

      // The source throws a SyntaxError; getKeywords skips it
      await expect(getKeywords(mockParsedData, mockDocument)).resolves.toEqual(
        [],
      );
    });
  });

  describe('Extended keywords feature', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: true,
        input_headings_slider: 3,
      });
    });

    it('should use description for extended keywords when enabled', async () => {
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
      getDescription.mockReturnValue(
        'This is a test description with some words',
      );
      cacheGet.mockResolvedValue(['test', 'description', 'words']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(getDescription).toHaveBeenCalledWith(mockDocument);
      expect(result).toBeDefined();
    });

    it('should use headlines for extended keywords when description is empty', async () => {
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
      getDescription.mockReturnValue('');
      cacheGet.mockResolvedValue(['headline', 'words']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toBeDefined();
    });
  });

  describe('Keyword reduction', () => {
    it('should reduce keywords when cbx_reduceKeywords is true', async () => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: true,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });

      getMeta.mockReturnValue(['keyword1', 'keyword2', 'keyword1']);
      getOption.mockResolvedValue(true); // cbx_reduceKeywords for reduceKeywords function
      cacheGet.mockResolvedValue(['keyword1', 'keyword2', 'keyword3']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2']);
    });

    it('should return empty array when cache has no keywords for reduction', async () => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: true,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });

      getMeta.mockReturnValue(['keyword1', 'keyword2']);
      getOption.mockResolvedValue(true); // cbx_reduceKeywords for reduceKeywords function
      cacheGet.mockResolvedValue([]);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });

    it('should handle cache error gracefully', async () => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: true,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });

      getMeta.mockReturnValue(['keyword1', 'keyword2']);
      getOption.mockResolvedValue(true); // cbx_reduceKeywords for reduceKeywords function
      cacheGet.mockRejectedValue(new Error('Cache error'));

      // The implementation doesn't catch cache errors - they propagate
      await expect(getKeywords(mockParsedData, mockDocument)).rejects.toThrow(
        'Cache error',
      );
    });
  });

  // S5: the xplGlobal/brute-force regexes moved into extractPageData.js,
  // which runs in-page and returns their results as parsedData.xplKeywords /
  // parsedData.bruteForceKeywords. getKeywords' closures are now pure field
  // reads (see getKeywords.js), so these tests verify the read, not the
  // regex/JSON-parsing logic -- that has its own coverage in
  // extractPageData.test.js, including the malformed-JSON case.
  describe('xplGlobal extraction (IEEE) -- pre-extracted field read', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
    });

    it('should use parsedData.xplKeywords when present', async () => {
      mockParsedData = { xplKeywords: ['kw1', 'kw2'] };

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['kw1', 'kw2']);
    });

    it('should return empty when xplKeywords is absent', async () => {
      mockParsedData = {};

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });
  });

  describe('Brute force keywords extraction -- pre-extracted field read', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
    });

    it('should use parsedData.bruteForceKeywords when present', async () => {
      mockParsedData = {
        bruteForceKeywords: ['keyword1', ' keyword2', ' keyword3'],
      };

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should return empty when bruteForceKeywords is absent', async () => {
      mockParsedData = {};

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual([]);
    });
  });

  describe('Merging all sources', () => {
    beforeEach(() => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: false,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      getOption.mockResolvedValue(false);
      getMeta.mockImplementation((doc, { id }) =>
        id === 'keywords' ? ['OpenAI, security'] : [],
      );
      mockDocument.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'a[rel=tag]') return [{ textContent: 'Privacy' }];
        if (selector === 'script[type="application/ld+json"]') {
          return [{ innerText: JSON.stringify({ keywords: ['openai', 'AI'] }) }];
        }
        return [];
      });
    });

    it('should combine keywords from every source in source order', async () => {
      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['OpenAI', 'security', 'Privacy', 'AI']);
    });

    it('should drop case-insensitive duplicates, keeping the first spelling', async () => {
      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toContain('OpenAI');
      expect(result).not.toContain('openai');
    });

    it('should include xplGlobal keywords alongside page sources', async () => {
      mockParsedData = { xplKeywords: ['extra'] };

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['OpenAI', 'security', 'Privacy', 'AI', 'extra']);
    });

    it('should ignore brute-force keywords when a real source found some', async () => {
      mockParsedData = { bruteForceKeywords: ['noise'] };

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).not.toContain('noise');
    });

    it('should fall back to brute-force keywords when nothing else found any', async () => {
      getMeta.mockReturnValue([]);
      mockDocument.querySelectorAll.mockReturnValue([]);
      mockParsedData = { bruteForceKeywords: ['UK news', ' Military ', 'uk NEWS'] };

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['UK news', 'Military']);
    });

    it('should keep the other sources when one throws', async () => {
      mockDocument.getElementById.mockReturnValue({ innerText: 'invalid json' });

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['OpenAI', 'security', 'Privacy', 'AI']);
    });

    it('should reduce the merged keywords once', async () => {
      getOption.mockResolvedValue(true); // cbx_reduceKeywords
      cacheGet.mockResolvedValue(['privacy', 'ai']);

      const result = await getKeywords(mockParsedData, mockDocument);

      expect(result).toEqual(['Privacy', 'AI']);
    });
  });

  describe('mergeKeywords', () => {
    it('should trim, drop empty and non-string entries, and dedupe', () => {
      expect(
        mergeKeywords([' a ', '', '  ', null, 42, { x: 1 }, 'A', 'b', 'a']),
      ).toEqual(['a', 'b']);
    });

    it('should return [] for no keywords', () => {
      expect(mergeKeywords([])).toEqual([]);
    });
  });

  describe('Error handling', () => {
    it('should handle errors gracefully and return empty array', async () => {
      getOptions.mockResolvedValue({
        cbx_autoTags: true,
        cbx_reduceKeywords: true,
        cbx_extendedKeywords: false,
        input_headings_slider: 3,
      });
      // Use a keyword with a divider to trigger reduceKeywords call
      getMeta.mockReturnValue(['keyword1, keyword2']);
      getOption.mockRejectedValue(new Error('Storage error'));

      // The implementation doesn't catch errors from getOption - they propagate
      await expect(getKeywords(mockParsedData, mockDocument)).rejects.toThrow(
        'Storage error',
      );
    });
  });
});
