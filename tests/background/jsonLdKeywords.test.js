/**
 * Unit tests for JSON-LD keyword extraction
 */
import { describe, it, expect } from 'vitest';
import {
  extractJsonLdKeywords,
  extractKeywordsFromJsonLd,
} from '../../src/background/modules/page/keywords/jsonLdKeywords.js';

const documentWith = (...scripts) => ({
  querySelectorAll: () => scripts.map((innerText) => ({ innerText })),
});

describe('extractKeywordsFromJsonLd', () => {
  it('reads keywords from an Article inside @graph', () => {
    const jsonld = {
      '@graph': [
        { '@type': 'WebSite' },
        { '@type': 'Article', keywords: ['a', 'b'] },
      ],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['a', 'b']);
  });

  it('returns [] for a @graph Article without keywords', () => {
    const jsonld = { '@graph': [{ '@type': 'Article' }] };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual([]);
  });

  it('reads keywords from a single-object @graph Article', () => {
    const jsonld = { '@graph': { '@type': 'Article', keywords: ['x'] } };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['x']);
  });

  it('accepts a keywords array', () => {
    expect(extractKeywordsFromJsonLd({ keywords: ['a', 'b'] })).toEqual([
      'a',
      'b',
    ]);
  });

  it('splits a comma-separated keywords string', () => {
    expect(extractKeywordsFromJsonLd({ keywords: 'a,b,c' })).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('reads termCode labels (CNN) instead of returning the objects', () => {
    const jsonld = {
      keywords: [
        { termCode: { label: 'Space' } },
        { termCode: {} },
        { termCode: { label: 'Japan' } },
      ],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['Space', 'Japan']);
  });

  it('skips unusable array entries but keeps termCode labels and plain strings', () => {
    const jsonld = {
      keywords: [{ termCode: { label: 'Space' } }, null, 'plain', 42, {}],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['Space', 'plain']);
  });

  it('reads schema.org DefinedTerm keywords by name', () => {
    const jsonld = {
      keywords: [
        { '@type': 'DefinedTerm', name: 'Physics' },
        { '@type': 'DefinedTerm', name: 'Chemistry' },
      ],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['Physics', 'Chemistry']);
  });

  describe('keywords of an unexpected type', () => {
    it.each([
      ['an empty array', []],
      ['a number', 42],
      ['an object without length', { a: 1 }],
      ['true', true],
      ['an array of unusable entries', [null, 1, {}]],
    ])('yields no keywords, without throwing, for %s', (_label, keywords) => {
      expect(() => extractKeywordsFromJsonLd({ keywords })).not.toThrow();
      expect(extractKeywordsFromJsonLd({ keywords })).toEqual([]);
    });

    it('does not lose the mainEntity keywords of the same block', () => {
      const jsonld = {
        keywords: 42,
        mainEntity: { keywords: ['a', 'b'] },
      };

      expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['a', 'b']);
    });

    it('does not let an empty-keywords Article in @graph mask mainEntity', () => {
      const jsonld = {
        '@graph': [{ '@type': 'NewsArticle', keywords: [] }],
        mainEntity: { keywords: ['from', 'entity'] },
      };

      // An Article without keywords used to return [] here, which the ?? chain
      // treated as "found" and stopped.
      expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['from', 'entity']);
    });

    it('does not let an Article without keywords in @graph mask top-level keywords', () => {
      const jsonld = {
        '@graph': [{ '@type': 'Article', headline: 'x' }],
        keywords: 'top, level',
      };

      expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['top', ' level']);
    });
  });

  it('reads mainEntity.keywords given as a comma-separated string', () => {
    const jsonld = { mainEntity: { keywords: 'one,two' } };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['one', 'two']);
  });

  it('lets a later block win when an earlier one has only unusable keywords', () => {
    const document = {
      querySelectorAll: () => [
        { innerText: JSON.stringify({ '@type': 'Article', keywords: [{}] }) },
        { innerText: JSON.stringify({ '@type': 'Article', keywords: ['real'] }) },
      ],
    };

    expect(extractJsonLdKeywords(document)).toEqual(['real']);
  });

  it('reads keywords from a top-level array of objects', () => {
    const jsonld = [
      { '@type': 'BreadcrumbList' },
      { '@type': 'NewsArticle', keywords: ['a', 'b'] },
    ];

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['a', 'b']);
  });

  it('returns [] for a top-level array without keywords', () => {
    const jsonld = [{ '@type': 'NewsArticle', articleSection: ['business'] }];

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual([]);
  });

  it('ignores non-object entries and broken items in a top-level array', () => {
    const jsonld = [
      null,
      'text',
      { keywords: { length: 2 } }, // throws inside extraction
      { keywords: 'x,y' },
    ];

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['x', 'y']);
  });

  it('falls back to mainEntity.keywords', () => {
    const jsonld = { mainEntity: { keywords: ['n1', 'n2'] } };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['n1', 'n2']);
  });

  it('returns [] when nothing applies', () => {
    expect(extractKeywordsFromJsonLd({ '@type': 'Thing' })).toEqual([]);
  });

  it('reads keywords from a NewsArticle inside @graph (sciencenews.org)', () => {
    const jsonld = {
      '@graph': [
        { '@type': 'Organization' },
        { '@type': 'NewsArticle', keywords: 'blue rose' },
      ],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['blue rose']);
  });

  it('reads keywords from a BlogPosting inside @graph', () => {
    const jsonld = {
      '@graph': [{ '@type': 'BlogPosting', keywords: ['a', 'b'] }],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['a', 'b']);
  });

  it('accepts an @type array that includes an Article type', () => {
    const jsonld = {
      '@graph': [{ '@type': ['WebPage', 'NewsArticle'], keywords: ['x'] }],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['x']);
  });

  it('returns a string keywords field on a @graph Article as an array', () => {
    const jsonld = { '@graph': [{ '@type': 'Article', keywords: 'a,b' }] };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['a', 'b']);
  });

  it('ignores null nodes inside @graph', () => {
    const jsonld = {
      '@graph': [null, { '@type': 'Article', keywords: ['x'] }],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['x']);
  });
});

describe('extractJsonLdKeywords', () => {
  it('returns the keywords of a script block', () => {
    const document = documentWith(JSON.stringify({ keywords: ['a', 'b'] }));

    expect(extractJsonLdKeywords(document)).toEqual(['a', 'b']);
  });

  it('skips invalid JSON and continues with the next block', () => {
    const document = documentWith(
      '{ not json',
      JSON.stringify({ keywords: ['ok'] }),
    );

    expect(extractJsonLdKeywords(document)).toEqual(['ok']);
  });

  it('does not throw on a shape that breaks extraction', () => {
    // truthy `length`, no index 0 -> used to throw a TypeError
    const broken = JSON.stringify({ keywords: { length: 2 } });
    const document = documentWith(broken, JSON.stringify({ keywords: ['ok'] }));

    expect(() => extractJsonLdKeywords(document)).not.toThrow();
    expect(extractJsonLdKeywords(document)).toEqual(['ok']);
  });

  it('finds keywords in a script block that holds a top-level array', () => {
    const document = documentWith(
      JSON.stringify([{ '@type': 'NewsArticle', keywords: ['a', 'b'] }]),
    );

    expect(extractJsonLdKeywords(document)).toEqual(['a', 'b']);
  });

  it('returns [] when there are no JSON-LD blocks', () => {
    expect(extractJsonLdKeywords(documentWith())).toEqual([]);
  });

  it('keeps looking after a block without keywords', () => {
    const document = documentWith(
      JSON.stringify({ '@type': 'Organization', name: 'x' }),
      JSON.stringify({ '@type': 'Article', keywords: ['a', 'b'] }),
    );

    expect(extractJsonLdKeywords(document)).toEqual(['a', 'b']);
  });

  it('keeps found keywords when a later block has none', () => {
    const document = documentWith(
      JSON.stringify({ '@type': 'Article', keywords: ['a', 'b'] }),
      JSON.stringify({ '@type': 'Organization', name: 'x' }),
    );

    expect(extractJsonLdKeywords(document)).toEqual(['a', 'b']);
  });

  it('returns the keywords of the first block that has any', () => {
    const document = documentWith(
      JSON.stringify({ keywords: ['first'] }),
      JSON.stringify({ keywords: ['second'] }),
    );

    expect(extractJsonLdKeywords(document)).toEqual(['first']);
  });
});
