/**
 * Unit tests for mock document creation
 * Tests the createMockDocument function that provides DOM-like interface
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import the function we need to test - we'll need to extract it or test via getData
// For now, let's create a standalone test by importing the getData module and testing the mock document behavior

// We need to mock the createMockDocument function behavior
// Since it's a private function, we'll test it indirectly through integration tests
// But let's create a test that validates the mock document interface

describe('Mock Document Interface', () => {
  // Helper to create mock document (replicating the function from getData.js)
  function createMockDocument(parsedData) {
    const mockDoc = {
      // querySelectorAll implementation - handles both simple and complex selectors
      querySelectorAll: function(selector) {
        // Handle specific selectors used in getKeywords.js
        if (selector === 'a[rel=tag]') {
          return parsedData.aRelTag.map(text => ({ textContent: text }));
        }
        if (selector === 'a[rel=category]') {
          return parsedData.aRelCategory.map(text => ({ text: text, textContent: text }));
        }
        if (selector === 'script[type="application/ld+json"]') {
          return parsedData.jsonLdScripts.map(text => ({ innerText: text }));
        }
        if (selector === 'script') {
          return parsedData.scripts.map(text => ({ text: text }));
        }
        if (selector === 'a[data-ga-click="Topic, repository page"]') {
          return parsedData.githubTopics.map(text => ({ textContent: text, trim: () => text.trim() }));
        }
        // For headlines
        if (selector.startsWith('h') && selector.length === 2) {
          const headlines = parsedData.headlines[selector] || [];
          return headlines.map(text => ({
            textContent: text,
            innerText: text,
            split: (regex) => text.split(regex)
          }));
        }

        // Handle meta tag selectors used by getMeta.js
        // Format examples: [property=\"og:description\" i], [name=\"description\"], [name=\"description\" i]
        if (selector.includes('[') && selector.includes(']')) {
          // Extract attribute selector - handle both quoted and unquoted values
          // Match patterns like: [name=\"description\"], [property=\"og:description\" i], [name=description]
          const attrMatch = selector.match(/\[([^\]=]+)=(?:"([^"]+)"|([^\s\]]+))(\s+i)?\]/);
          if (attrMatch) {
            const attrName = attrMatch[1];
            const attrValue = attrMatch[2] || attrMatch[3]; // Either quoted or unquoted
            const isCaseInsensitive = !!attrMatch[4]; // Has " i" suffix

            const filtered = parsedData.metaTags.filter(meta => {
              const actualValue = meta[attrName];
              if (!actualValue || !attrValue) return false;

              if (isCaseInsensitive) {
                return actualValue.toLowerCase() === attrValue.toLowerCase();
              }
              return actualValue === attrValue;
            });

            return filtered.map(meta => ({
              getAttribute: (attr) => meta[attr],
              content: meta.content
            }));
          }
        }

        return [];
      },

      // getElementById implementation
      getElementById: function(id) {
        if (id === '__NEXT_DATA__') {
          return parsedData.nextData ? { innerText: parsedData.nextData, textContent: parsedData.nextData } : null;
        }
        return null;
      },

      // querySelector implementation (for single element)
      querySelector: function(selector) {
        const results = this.querySelectorAll(selector);
        return results.length > 0 ? results[0] : null;
      }
    };

    return mockDoc;
  }

  describe('querySelectorAll', () => {
    it('should handle a[rel=tag] selector', () => {
      const parsedData = {
        aRelTag: ['tag1', 'tag2', 'tag3'],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const results = mockDoc.querySelectorAll('a[rel=tag]');

      expect(results).toHaveLength(3);
      expect(results[0].textContent).toBe('tag1');
      expect(results[1].textContent).toBe('tag2');
      expect(results[2].textContent).toBe('tag3');
    });

    it('should handle a[rel=category] selector', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: ['cat1', 'cat2'],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const results = mockDoc.querySelectorAll('a[rel=category]');

      expect(results).toHaveLength(2);
      expect(results[0].text).toBe('cat1');
      expect(results[0].textContent).toBe('cat1');
      expect(results[1].text).toBe('cat2');
      expect(results[1].textContent).toBe('cat2');
    });

    it('should handle script[type="application/ld+json"] selector', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: ['{"keywords": ["tech"]}', '{"type": "article"}'],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const results = mockDoc.querySelectorAll('script[type="application/ld+json"]');

      expect(results).toHaveLength(2);
      expect(results[0].innerText).toBe('{"keywords": ["tech"]}');
      expect(results[1].innerText).toBe('{"type": "article"}');
    });

    it('should handle script selector (all scripts)', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: ['console.log("test");', 'var x = 1;'],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const results = mockDoc.querySelectorAll('script');

      expect(results).toHaveLength(2);
      expect(results[0].text).toBe('console.log("test");');
      expect(results[1].text).toBe('var x = 1;');
    });

    it('should handle GitHub topic selector', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: ['JavaScript', 'TypeScript', 'React'],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const results = mockDoc.querySelectorAll('a[data-ga-click="Topic, repository page"]');

      expect(results).toHaveLength(3);
      expect(results[0].textContent).toBe('JavaScript');
      expect(results[0].trim()).toBe('JavaScript');
      expect(results[1].textContent).toBe('TypeScript');
      expect(results[2].textContent).toBe('React');
    });

    it('should handle headline selectors (h1-h6)', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: {
          h1: ['Main Title'],
          h2: ['Subtitle 1', 'Subtitle 2'],
          h3: ['Section'],
          h4: [],
          h5: ['Detail'],
          h6: ['Small']
        }
      };

      const mockDoc = createMockDocument(parsedData);

      // Test h1
      const h1Results = mockDoc.querySelectorAll('h1');
      expect(h1Results).toHaveLength(1);
      expect(h1Results[0].textContent).toBe('Main Title');
      expect(h1Results[0].innerText).toBe('Main Title');

      // Test h2
      const h2Results = mockDoc.querySelectorAll('h2');
      expect(h2Results).toHaveLength(2);
      expect(h2Results[0].textContent).toBe('Subtitle 1');
      expect(h2Results[1].textContent).toBe('Subtitle 2');

      // Test split functionality
      const splitResult = h2Results[0].split(/,/);
      expect(splitResult).toEqual(['Subtitle 1']);
    });

    it('should handle meta tag selectors with attribute matching', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [
          { name: 'description', property: null, itemprop: null, httpEquiv: null, content: 'Page description' },
          { name: null, property: 'og:description', itemprop: null, httpEquiv: null, content: 'OG description' },
          { name: 'keywords', property: null, itemprop: null, httpEquiv: null, content: 'tech, web' },
          { name: null, property: 'article:tag', itemprop: null, httpEquiv: null, content: 'article-tag' },
        ],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);

      // Test name="description"
      const descResults = mockDoc.querySelectorAll('meta[name="description"]');
      expect(descResults).toHaveLength(1);
      expect(descResults[0].getAttribute('name')).toBe('description');
      expect(descResults[0].content).toBe('Page description');

      // Test property="og:description"
      const ogResults = mockDoc.querySelectorAll('meta[property="og:description"]');
      expect(ogResults).toHaveLength(1);
      expect(ogResults[0].getAttribute('property')).toBe('og:description');
      expect(ogResults[0].content).toBe('OG description');

      // Test case-insensitive matching
      const caseInsensitiveResults = mockDoc.querySelectorAll('meta[name="DESCRIPTION" i]');
      expect(caseInsensitiveResults).toHaveLength(1);
      expect(caseInsensitiveResults[0].content).toBe('Page description');
    });

    it('should return empty array for unknown selectors', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);

      expect(mockDoc.querySelectorAll('.unknown-class')).toEqual([]);
      expect(mockDoc.querySelectorAll('#unknown-id')).toEqual([]);
      expect(mockDoc.querySelectorAll('div > span')).toEqual([]);
    });
  });

  describe('getElementById', () => {
    it('should return element for __NEXT_DATA__', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '{"props": {"page": "test"}}',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const element = mockDoc.getElementById('__NEXT_DATA__');

      expect(element).not.toBeNull();
      expect(element.innerText).toBe('{"props": {"page": "test"}}');
      expect(element.textContent).toBe('{"props": {"page": "test"}}');
    });

    it('should return null for unknown IDs', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);

      expect(mockDoc.getElementById('unknown-id')).toBeNull();
      expect(mockDoc.getElementById('some-other-element')).toBeNull();
    });

    it('should return null when nextData is empty', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      expect(mockDoc.getElementById('__NEXT_DATA__')).toBeNull();
    });
  });

  describe('querySelector', () => {
    it('should return first matching element', () => {
      const parsedData = {
        aRelTag: ['tag1', 'tag2'],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const result = mockDoc.querySelector('a[rel=tag]');

      expect(result).not.toBeNull();
      expect(result.textContent).toBe('tag1');
    });

    it('should return null when no elements match', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);
      const result = mockDoc.querySelector('a[rel=tag]');

      expect(result).toBeNull();
    });
  });

  describe('Integration with getMeta', () => {
    it('should work with getMeta function pattern', () => {
      const parsedData = {
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        metaTags: [
          { name: 'description', property: null, itemprop: null, httpEquiv: null, content: 'Test description' },
          { name: null, property: 'og:description', itemprop: null, httpEquiv: null, content: 'OG description' },
          { name: 'twitter:description', property: null, itemprop: null, httpEquiv: null, content: 'Twitter description' },
        ],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
      };

      const mockDoc = createMockDocument(parsedData);

      // Simulate getMeta function calls
      const getMeta = (document, ...metaNames) => {
        const metas = [];
        for (const { type, id } of metaNames) {
          const metaNodelist = document.querySelectorAll(`[${type}="${id}" i]`);
          if (metaNodelist.length > 0) {
            for (const meta of metaNodelist) {
              const { content } = meta;
              if (content !== '' && content !== undefined) {
                metas.push(content);
              }
            }
            if (metas.length > 0) {
              return metas;
            }
          }
        }
        return [];
      };

      // Test getting description
      const description = getMeta(mockDoc, { type: 'name', id: 'description' });
      expect(description).toEqual(['Test description']);

      // Test getting og:description
      const ogDescription = getMeta(mockDoc, { type: 'property', id: 'og:description' });
      expect(ogDescription).toEqual(['OG description']);

      // Test getting twitter:description
      const twitterDescription = getMeta(mockDoc, { type: 'name', id: 'twitter:description' });
      expect(twitterDescription).toEqual(['Twitter description']);
    });
  });
});
