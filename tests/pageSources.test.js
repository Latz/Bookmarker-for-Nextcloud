/**
 * Unit tests for the site-specific keyword sources
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/log.js', () => ({
  default: vi.fn(),
}));

import {
  extractGithubKeywords,
  extractGtmKeywords,
  extractNextDataKeywords,
  extractRelCategoryKeywords,
  extractRelTagKeywords,
} from '../src/background/modules/page/keywords/pageSources.js';

/** Builds a document whose querySelectorAll answers by selector. */
const documentWith = (bySelector = {}, byId = {}) => ({
  querySelectorAll: (selector) => bySelector[selector] ?? [],
  getElementById: (id) => byId[id] ?? null,
});

describe('extractRelTagKeywords / extractRelCategoryKeywords', () => {
  it('collects the text of rel=tag links', () => {
    const document = documentWith({
      'a[rel=tag]': [{ textContent: 'one' }, { textContent: 'two' }],
    });

    expect(extractRelTagKeywords(document)).toEqual(['one', 'two']);
  });

  it('collects the text of rel=category links', () => {
    const document = documentWith({
      'a[rel=category]': [{ textContent: 'news' }],
    });

    expect(extractRelCategoryKeywords(document)).toEqual(['news']);
  });

  it('returns [] when there are none', () => {
    expect(extractRelTagKeywords(documentWith())).toEqual([]);
    expect(extractRelCategoryKeywords(documentWith())).toEqual([]);
  });
});

describe('extractGtmKeywords', () => {
  const scriptWith = (text) => ({ text });

  it('reads pipe-separated keywords from dataLayer.push', () => {
    const script = scriptWith(
      'dataLayer.push({"content":{"keywords":"NASA|space|rocket"}})',
    );
    const document = documentWith({ script: [script] });

    expect(extractGtmKeywords(document)).toEqual(['NASA', 'space', 'rocket']);
  });

  it('skips an unrelated dataLayer.push script and reads the next one (Ars Technica)', () => {
    const consent = scriptWith(
      'function f(name){ dataLayer.push({\n event: name, consent: Math.round(1) }); }',
    );
    const data = scriptWith(
      'window.dataLayer=[];dataLayer.push({"event":"loaded","user":{"id":undefined},"content":{"keywords":"canadarm2|NASA|space"}})',
    );
    const document = documentWith({ script: [consent, data] });

    expect(extractGtmKeywords(document)).toEqual(['canadarm2', 'NASA', 'space']);
  });

  it('tries every push call within a script', () => {
    const script = scriptWith(
      'dataLayer.push({"event":"a"});dataLayer.push({"content":{"keywords":"x|y"}})',
    );
    const document = documentWith({ script: [script] });

    expect(extractGtmKeywords(document)).toEqual(['x', 'y']);
  });

  it('skips a push whose content has no keywords or an empty string', () => {
    const document = documentWith({
      script: [
        scriptWith('dataLayer.push({"content":{"keywords":""}})'),
        scriptWith('dataLayer.push({"content":{}})'),
        scriptWith('dataLayer.push({"content":{"keywords":"ok"}})'),
      ],
    });

    expect(extractGtmKeywords(document)).toEqual(['ok']);
  });

  it('returns [] when the dataLayer JSON is malformed', () => {
    const document = documentWith({
      script: [scriptWith('dataLayer.push({not json)')],
    });

    expect(extractGtmKeywords(document)).toEqual([]);
  });

  it('ignores scripts without dataLayer.push', () => {
    const document = documentWith({ script: [scriptWith('var a = 1;')] });

    expect(extractGtmKeywords(document)).toEqual([]);
  });

  describe('object literals the old push\\((.*?)\\) regex could not read', () => {
    const keywordsOf = (text) =>
      extractGtmKeywords(documentWith({ script: [scriptWith(text)] }));

    it('reads a push spread over several lines', () => {
      expect(
        keywordsOf(`dataLayer.push({
          "event": "pageview",
          "content": {
            "keywords": "a|b"
          }
        });`),
      ).toEqual(['a', 'b']);
    });

    it('is not cut off by a ")" inside a string', () => {
      expect(
        keywordsOf(
          'dataLayer.push({"title":"Foo (bar)","content":{"keywords":"x|y"}})',
        ),
      ).toEqual(['x', 'y']);
    });

    it('is not confused by braces inside strings or escaped quotes', () => {
      expect(
        keywordsOf(
          'dataLayer.push({"t":"a } b { \\" }","content":{"keywords":"k1|k2"}})',
        ),
      ).toEqual(['k1', 'k2']);
    });

    it('does not rewrite the word "undefined" inside a string value', () => {
      expect(
        keywordsOf(
          'dataLayer.push({"user":undefined,"content":{"keywords":"undefined behaviour|c++"}})',
        ),
      ).toEqual(['undefined behaviour', 'c++']);
    });

    it('finds a push far into a large script (was limited to the first 5000 chars)', () => {
      const filler = 'var x = 1;\n'.repeat(2000); // ~22 kB
      expect(
        keywordsOf(`${filler}dataLayer.push({"content":{"keywords":"late|push"}})`),
      ).toEqual(['late', 'push']);
    });

    it('skips a push that is not an object literal', () => {
      expect(
        keywordsOf(
          'dataLayer.push(arguments);dataLayer.push({"content":{"keywords":"ok"}})',
        ),
      ).toEqual(['ok']);
    });
  });

  describe('hostile scripts', () => {
    it('stays fast with many unclosed pushes', () => {
      const text = 'dataLayer.push({"a":'.repeat(50000);
      const document = documentWith({ script: [scriptWith(text)] });

      const start = performance.now();
      expect(extractGtmKeywords(document)).toEqual([]);

      expect(performance.now() - start).toBeLessThan(1000);
    });

    it('gives up on an object that never closes instead of scanning to the end', () => {
      const text = `dataLayer.push({${'"k":"v",'.repeat(20000)}`; // ~160 kB, no }
      const document = documentWith({ script: [scriptWith(text)] });

      const start = performance.now();
      expect(extractGtmKeywords(document)).toEqual([]);

      expect(performance.now() - start).toBeLessThan(1000);
    });
  });
});

describe('extractGithubKeywords', () => {
  it('uses the first selector that finds topics and trims the text', () => {
    const document = documentWith({
      'a[class*="topic-tag"]': [
        { textContent: ' opencode ' },
        { textContent: '  ' },
        { textContent: 'cli' },
      ],
      'a[href^="/topics/"]': [{ textContent: 'ignored' }],
    });

    expect(extractGithubKeywords(document)).toEqual(['opencode', 'cli']);
  });

  it('falls back to the next selector', () => {
    const document = documentWith({
      'a[href^="/topics/"]': [{ textContent: 'fallback' }],
    });

    expect(extractGithubKeywords(document)).toEqual(['fallback']);
  });

  it('returns [] when nothing matches', () => {
    expect(extractGithubKeywords(documentWith())).toEqual([]);
  });
});

describe('extractNextDataKeywords', () => {
  const nextData = (data) => ({
    __NEXT_DATA__: { innerText: JSON.stringify(data) },
  });

  it('reads comma-separated post tags', () => {
    const document = documentWith(
      {},
      nextData({ props: { pageProps: { post: { tags: 'a,b' } } } }),
    );

    expect(extractNextDataKeywords(document)).toEqual(['a', 'b']);
  });

  it('returns [] when __NEXT_DATA__ is missing', () => {
    expect(extractNextDataKeywords(documentWith())).toEqual([]);
  });

  it('returns [] when there is no post.tags', () => {
    const document = documentWith({}, nextData({ props: { pageProps: {} } }));

    expect(extractNextDataKeywords(document)).toEqual([]);
  });
});
