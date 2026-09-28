// @vitest-environment happy-dom
/**
 * Unit tests for extractPageData.
 *
 * This function is injected via chrome.scripting.executeScript and runs
 * directly against the live page DOM (S5 fix: replaces the old
 * offscreen-document DOMParser round trip, which shipped the entire page
 * HTML to a service worker and back). It reads only global `document`, so it
 * can be tested directly against real DOM built in happy-dom -- no chrome mocking
 * needed at all.
 *
 * The file it replaces (tests/offscreen.test.js) never actually exercised
 * this extraction logic: every assertion there checked a hand-crafted mock
 * response, since parseHTMLWithOffscreen's real work ran inside a browser's
 * DOMParser, unreachable from vitest. These tests build real DOM and call the
 * real function, so this is a coverage improvement, not just a migration.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { extractPageData } from '../src/background/modules/extractPageData.js';
import { createMockDocument } from '../src/background/modules/mockDocument.js';
import {
  extractRelCategoryKeywords,
  extractRelTagKeywords,
} from '../src/background/modules/keywords/pageSources.js';

describe('extractPageData', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('extracts all meta tag variations', () => {
    document.head.innerHTML = `
      <meta name="description" content="Page description">
      <meta property="og:description" content="OG description">
      <meta name="twitter:description" content="Twitter description">
      <meta name="keywords" content="keyword1, keyword2">
      <meta property="article:tag" content="tag1">
      <meta itemprop="keywords" content="meta-itemprop">
      <meta http-equiv="keywords" content="meta-http-equiv">
    `;

    const result = extractPageData(3);

    expect(result.metaTags).toHaveLength(7);
    expect(result.metaTags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: 'Page description',
      }),
    );
    expect(result.metaTags).toContainEqual(
      expect.objectContaining({
        property: 'og:description',
        content: 'OG description',
      }),
    );
    // description: name="description", property="og:description",
    // name="twitter:description" -- in that selector order.
    expect(result.description).toEqual([
      'Page description',
      'OG description',
      'Twitter description',
    ]);
  });

  it('extracts a[rel=tag] and a[rel=category] links', () => {
    document.body.innerHTML = `
      <a rel="tag" href="/tag1">Tag 1</a>
      <a rel="tag" href="/tag2">Tag 2</a>
      <a rel="category" href="/cat1">Category 1</a>
      <a rel="other" href="/other">Other</a>
    `;

    const result = extractPageData(3);

    expect(result.aRelTag).toEqual(['Tag 1', 'Tag 2']);
    expect(result.aRelCategory).toEqual(['Category 1']);
  });

  it('matches rel values that list several tokens (rel="category tag")', () => {
    document.body.innerHTML = `
      <a rel="category tag" href="/c1">Both</a>
      <a rel="tag nofollow" href="/t1">Tag nofollow</a>
      <a rel="noopener category" href="/c2">Category noopener</a>
      <a rel="tagline" href="/x">Not a tag</a>
      <a rel="subcategory" href="/y">Not a category</a>
    `;

    const result = extractPageData(3);

    expect(result.aRelTag).toEqual(['Both', 'Tag nofollow']);
    expect(result.aRelCategory).toEqual(['Both', 'Category noopener']);
  });

  it('lets the rel-tag extractors see rel="category tag" links via the mock document', () => {
    document.body.innerHTML = `
      <a rel="category tag" href="/flock">flock</a>
      <a rel="tag" href="/alpr">alpr</a>
      <a rel="category" href="/news">news</a>
    `;

    const mockDoc = createMockDocument(extractPageData(3));

    expect(extractRelTagKeywords(mockDoc)).toEqual(['flock', 'alpr']);
    expect(extractRelCategoryKeywords(mockDoc)).toEqual(['flock', 'news']);
  });

  it('extracts JSON-LD script contents', () => {
    document.head.innerHTML = `
      <script type="application/ld+json">{"@type":"Article","keywords":["a","b"]}</script>
      <script type="application/ld+json">{"@type":"Other"}</script>
    `;

    const result = extractPageData(3);

    expect(result.jsonLdScripts).toHaveLength(2);
    expect(JSON.parse(result.jsonLdScripts[0])).toEqual({
      '@type': 'Article',
      keywords: ['a', 'b'],
    });
  });

  it('extracts GitHub topics via the legacy data-ga-click selector', () => {
    document.body.innerHTML = `
      <a data-ga-click="Topic, repository page" href="/topic/javascript">JavaScript</a>
      <a data-ga-click="Topic, repository page" href="/topic/typescript">TypeScript</a>
    `;

    const result = extractPageData(3);

    expect(result.githubTopics).toEqual(['JavaScript', 'TypeScript']);
  });

  it('extracts GitHub topics via the modern topic-tag-name selector', () => {
    document.body.innerHTML = `
      <a href="/topics/rust"><span class="topic-tag-name">rust</span></a>
      <a href="/topics/wasm"><span class="topic-tag-name">wasm</span></a>
    `;

    const result = extractPageData(3);

    expect(result.githubTopics).toEqual(['rust', 'wasm']);
  });

  it('extracts Next.js __NEXT_DATA__', () => {
    document.body.innerHTML = `
      <div id="__NEXT_DATA__">{"props":{"pageProps":{"data":"test"}}}</div>
    `;

    const result = extractPageData(3);

    expect(result.nextData).toBe('{"props":{"pageProps":{"data":"test"}}}');
  });

  it('returns an empty string for nextData when __NEXT_DATA__ is absent', () => {
    const result = extractPageData(3);
    expect(result.nextData).toBe('');
  });

  it('extracts scripts as .text for the Google Tag Manager extractor', () => {
    document.body.innerHTML = `<script>dataLayer.push({"content":{"keywords":"a|b"}});</script>`;

    const result = extractPageData(3);

    expect(result.scripts).toHaveLength(1);
    expect(result.scripts[0]).toContain('dataLayer.push');
  });

  describe('headingLevel bounding', () => {
    const html = `
      <h1>Main Title</h1>
      <h2>Subtitle</h2>
      <h3>Section</h3>
      <h4>Subsection</h4>
      <h5>Detail</h5>
      <h6>Small</h6>
    `;

    it('extracts all six levels when headingLevel is 6', () => {
      document.body.innerHTML = html;
      const result = extractPageData(6);

      expect(result.headlines).toEqual({
        h1: ['Main Title'],
        h2: ['Subtitle'],
        h3: ['Section'],
        h4: ['Subsection'],
        h5: ['Detail'],
        h6: ['Small'],
      });
    });

    it('only extracts up to headingLevel, unlike the old unconditional h1-h6 extraction', () => {
      document.body.innerHTML = html;
      const result = extractPageData(3);

      expect(result.headlines.h1).toEqual(['Main Title']);
      expect(result.headlines.h2).toEqual(['Subtitle']);
      expect(result.headlines.h3).toEqual(['Section']);
      // Real headlines exist in the DOM at h4-h6, but must not be extracted.
      expect(result.headlines.h4).toEqual([]);
      expect(result.headlines.h5).toEqual([]);
      expect(result.headlines.h6).toEqual([]);
    });
  });

  it('handles an empty page gracefully', () => {
    const result = extractPageData(3);

    expect(result).toEqual({
      metaTags: [],
      aRelTag: [],
      aRelCategory: [],
      jsonLdScripts: [],
      scripts: [],
      githubTopics: [],
      nextData: '',
      description: [],
      headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      xplKeywords: [],
      bruteForceKeywords: [],
    });
  });

  describe('raw-content regex extractors (moved in-page from getKeywords.js)', () => {
    it('extracts xplGlobal.document.metadata keywords', () => {
      document.body.innerHTML = `
        <script>xplGlobal.document.metadata={"keywords":[{"kwd":["physics","chemistry"]}]};</script>
      `;

      const result = extractPageData(3);

      expect(result.xplKeywords).toEqual(['physics', 'chemistry']);
    });

    it('returns an empty array when xplGlobal.document.metadata is absent', () => {
      const result = extractPageData(3);
      expect(result.xplKeywords).toEqual([]);
    });

    it('does not let malformed xplGlobal JSON crash extraction', () => {
      document.body.innerHTML = `
        <script>xplGlobal.document.metadata={not valid json};</script>
      `;

      const result = extractPageData(3);

      expect(result.xplKeywords).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('extracts brute-force keywords: "..." pattern, splitting on | too', () => {
      document.body.innerHTML = `
        <script>var x = { keywords: "Dream Chaser|NASA|spaceplane" };</script>
      `;

      const result = extractPageData(3);

      expect(result.bruteForceKeywords).toEqual([
        'Dream Chaser',
        'NASA',
        'spaceplane',
      ]);
    });

    it('extracts a comma-separated string under a quoted JSON key (Guardian)', () => {
      document.body.innerHTML = `
        <script>window.config = {"byline":"Ben","keywords":"UK news, Military,Police","id":1};</script>
      `;

      const result = extractPageData(3);

      expect(result.bruteForceKeywords).toEqual([
        'UK news',
        'Military',
        'Police',
      ]);
    });

    it('extracts a JSON array of keywords (Variety)', () => {
      document.body.innerHTML = `
        <script>var cfg = {"keywords":["Hulu","Kid Detective"],"categories":["News"]};</script>
      `;

      const result = extractPageData(3);

      expect(result.bruteForceKeywords).toEqual(['Hulu', 'Kid Detective']);
    });

    it('skips empty keywords values and uses the next real one', () => {
      document.body.innerHTML = `
        <script>
          var a = {"keywords":"","x":1, "keywords":[], "keywords":null};
          var b = {"keywords":"real, ones"};
        </script>
      `;

      const result = extractPageData(3);

      expect(result.bruteForceKeywords).toEqual(['real', 'ones']);
    });

    it('ignores keywords mentioned only as plain text', () => {
      document.body.innerHTML = '<p>Enter keywords and press search</p>';

      const result = extractPageData(3);

      expect(result.bruteForceKeywords).toEqual([]);
    });

    it('returns an empty array when the brute-force pattern is absent', () => {
      const result = extractPageData(3);
      expect(result.bruteForceKeywords).toEqual([]);
    });
  });

  it('returns {error} instead of throwing when extraction fails', () => {
    const original = document.querySelectorAll;
    // @ts-expect-error deliberately breaking querySelectorAll for this test
    document.querySelectorAll = () => {
      throw new Error('boom');
    };
    try {
      const result = extractPageData(3);
      expect(result.error).toBe('boom');
    } finally {
      document.querySelectorAll = original;
    }
  });
});
