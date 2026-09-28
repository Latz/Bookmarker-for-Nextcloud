/**
 * Unit tests for JSON-LD keyword extraction
 */
import { describe, it, expect } from 'vitest';
import {
  extractJsonLdKeywords,
  extractKeywordsFromJsonLd,
} from '../src/background/modules/keywords/jsonLdKeywords.js';

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

  it('skips array entries that are not termCode objects', () => {
    const jsonld = {
      keywords: [{ termCode: { label: 'Space' } }, null, 'plain'],
    };

    expect(extractKeywordsFromJsonLd(jsonld)).toEqual(['Space']);
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
});
