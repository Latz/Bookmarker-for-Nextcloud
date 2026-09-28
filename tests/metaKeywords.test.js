// @vitest-environment node
/**
 * Unit tests for extractMetaKeywords
 */
import { describe, it, expect } from 'vitest';
import { extractMetaKeywords } from '../src/background/modules/page/keywords/metaKeywords.js';

// Minimal stand-in for the document: answers only the attribute selector
// getMeta builds, e.g. [name="keywords" i].
function docWith(selector, metas) {
  return {
    querySelectorAll: (sel) => (sel === selector ? metas : []),
  };
}

describe('extractMetaKeywords', () => {
  it('splits a single comma separated keywords string', () => {
    const doc = docWith('[name="keywords" i]', [{ content: 'one, two,three' }]);

    expect(extractMetaKeywords(doc)).toEqual(['one', 'two', 'three']);
  });

  it('keeps a lone article:tag with spaces unsplit', () => {
    const doc = docWith('[property="article:tag" i]', [
      { content: 'Fatty Liver Disease' },
    ]);

    expect(extractMetaKeywords(doc)).toEqual(['Fatty Liver Disease']);
  });

  it('ignores a keywords meta tag without a content attribute (null)', () => {
    // extractPageData reports a missing attribute as content: null.
    const doc = docWith('[name="keywords" i]', [{ content: null }]);

    expect(() => extractMetaKeywords(doc)).not.toThrow();
    expect(extractMetaKeywords(doc)).toEqual([]);
  });

  it('still reads the valid tags when a sibling has no content', () => {
    const doc = docWith('[property="article:tag" i]', [
      { content: null },
      { content: 'alpha' },
      { content: 'beta' },
    ]);

    expect(extractMetaKeywords(doc)).toEqual(['alpha', 'beta']);
  });

  it('returns [] for a page without keyword meta tags', () => {
    expect(extractMetaKeywords({ querySelectorAll: () => [] })).toEqual([]);
  });
});
