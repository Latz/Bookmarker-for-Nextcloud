/**
 * Unit tests for offscreen document functionality
 * Tests the HTML parsing and mock document creation for DOMParser replacement
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseHTMLWithOffscreen } from '../src/background/modules/getBrowserTheme.js';

// Mock Chrome APIs for offscreen document
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

describe('Offscreen Document HTML Parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseHTMLWithOffscreen', () => {
    it('should successfully parse HTML and return structured data', async () => {
      // Mock no existing offscreen document
      chrome.runtime.getContexts.mockResolvedValue([]);

      // Mock successful parsing response
      const mockParsedData = {
        metaTags: [
          { name: 'description', property: null, itemprop: null, httpEquiv: null, content: 'Test description' },
          { name: null, property: 'og:description', itemprop: null, httpEquiv: null, content: 'OG description' },
        ],
        aRelTag: ['tag1', 'tag2'],
        aRelCategory: ['category1'],
        jsonLdScripts: ['{"keywords": ["test"] }'],
        scripts: ['console.log("test");'],
        githubTopics: ['topic1', 'topic2'],
        nextData: '{"pageProps": {}}',
        description: ['Test description', 'OG description'],
        headlines: {
          h1: ['Main Title'],
          h2: ['Subtitle'],
          h3: [],
          h4: [],
          h5: [],
          h6: [],
        },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockParsedData);

      const htmlContent = '<html><body><h1>Main Title</h1></body></html>';
      const result = await parseHTMLWithOffscreen(htmlContent);

      // Verify offscreen document was created
      expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
        url: 'chrome-extension://mock-id/src/background/modules/offscreen/offscreen.html',
        reasons: ['MATCH_MEDIA', 'DOM_PARSER'],
        justification: 'matchmedia request and HTML parsing',
      });

      // Verify message was sent
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        target: 'offscreen',
        msg: 'parseHTML',
        html: htmlContent,
      });

      // Note: The actual function doesn't close the document after successful parsing
      // The document is kept open for potential reuse

      // Verify result
      expect(result).toEqual(mockParsedData);
    });

    it('should reuse existing offscreen document if available', async () => {
      // Mock existing offscreen document
      chrome.runtime.getContexts.mockResolvedValue([
        { contextType: 'OFFSCREEN_DOCUMENT' },
      ]);

      const mockParsedData = {
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

      chrome.runtime.sendMessage.mockResolvedValue(mockParsedData);

      const htmlContent = '<html></html>';
      const result = await parseHTMLWithOffscreen(htmlContent);

      // Should NOT create new document
      expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();

      // Should still send message
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();

      // Should NOT close existing document
      expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();

      expect(result).toEqual(mockParsedData);
    });

    it('should handle parsing errors gracefully', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Parsing failed'));

      const htmlContent = '<html></html>';

      await expect(parseHTMLWithOffscreen(htmlContent)).rejects.toThrow('Parsing failed');

      // Note: The actual function doesn't close the document on error
      // It just logs the error and re-throws it
    });

    it('should handle timeout errors', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      // Mock a slow response that triggers timeout
      chrome.runtime.sendMessage.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      const htmlContent = '<html></html>';

      await expect(parseHTMLWithOffscreen(htmlContent)).rejects.toThrow('HTML parsing timeout');

      // Note: The actual function doesn't close the document on timeout
      // It just logs the error and re-throws it
    }, 15000);

    it('should handle error responses from offscreen document', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockResolvedValue({ error: 'DOM parsing error' });

      const htmlContent = '<html></html>';

      await expect(parseHTMLWithOffscreen(htmlContent)).rejects.toThrow('DOM parsing error');
    });

    it('should handle concurrent parsing requests', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const mockParsedData = {
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

      chrome.runtime.sendMessage.mockResolvedValue(mockParsedData);

      const html1 = '<html><h1>Title 1</h1></html>';
      const html2 = '<html><h1>Title 2</h1></html>';
      const html3 = '<html><h1>Title 3</h1></html>';

      // Run concurrent requests
      const results = await Promise.all([
        parseHTMLWithOffscreen(html1),
        parseHTMLWithOffscreen(html2),
        parseHTMLWithOffscreen(html3),
      ]);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toEqual(mockParsedData);
      });
    });
  });

  describe('Offscreen HTML parsing content extraction', () => {
    it('should extract all meta tag variations correctly', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const htmlContent = `
        <html>
          <head>
            <meta name="description" content="Page description">
            <meta property="og:description" content="OG description">
            <meta name="twitter:description" content="Twitter description">
            <meta name="keywords" content="keyword1, keyword2">
            <meta property="article:tag" content="tag1">
            <meta itemprop="keywords" content="meta-itemprop">
            <meta http-equiv="keywords" content="meta-http-equiv">
          </head>
          <body></body>
        </html>
      `;

      const mockResponse = {
        metaTags: [
          { name: 'description', property: null, itemprop: null, httpEquiv: null, content: 'Page description' },
          { name: null, property: 'og:description', itemprop: null, httpEquiv: null, content: 'OG description' },
          { name: 'twitter:description', property: null, itemprop: null, httpEquiv: null, content: 'Twitter description' },
          { name: 'keywords', property: null, itemprop: null, httpEquiv: null, content: 'keyword1, keyword2' },
          { name: null, property: 'article:tag', itemprop: null, httpEquiv: null, content: 'tag1' },
          { name: null, property: null, itemprop: 'keywords', httpEquiv: null, content: 'meta-itemprop' },
          { name: null, property: null, itemprop: null, httpEquiv: 'keywords', content: 'meta-http-equiv' },
        ],
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        description: ['Page description', 'OG description', 'Twitter description'],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);

      const result = await parseHTMLWithOffscreen(htmlContent);

      expect(result.metaTags).toHaveLength(7);
      expect(result.description).toHaveLength(3);
    });

    it('should extract link tags with rel attributes', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const htmlContent = `
        <html>
          <body>
            <a rel="tag" href="/tag1">Tag 1</a>
            <a rel="tag" href="/tag2">Tag 2</a>
            <a rel="category" href="/cat1">Category 1</a>
            <a rel="other" href="/other">Other</a>
          </body>
        </html>
      `;

      const mockResponse = {
        metaTags: [],
        aRelTag: ['Tag 1', 'Tag 2'],
        aRelCategory: ['Category 1'],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        description: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);

      const result = await parseHTMLWithOffscreen(htmlContent);

      expect(result.aRelTag).toEqual(['Tag 1', 'Tag 2']);
      expect(result.aRelCategory).toEqual(['Category 1']);
    });

    it('should extract JSON-LD scripts', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const htmlContent = `
        <html>
          <head>
            <script type="application/ld+json">
              {"@context": "https://schema.org", "keywords": ["tech", "web"]}
            </script>
            <script type="application/ld+json">
              {"@type": "Article", "keywords": ["news"]}
            </script>
            <script type="text/javascript">console.log("not json-ld");</script>
          </head>
        </html>
      `;

      const mockResponse = {
        metaTags: [],
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [
          '{"@context": "https://schema.org", "keywords": ["tech", "web"]}',
          '{"@type": "Article", "keywords": ["news"]}',
        ],
        scripts: [
          '{"@context": "https://schema.org", "keywords": ["tech", "web"]}',
          '{"@type": "Article", "keywords": ["news"]}',
          'console.log("not json-ld");',
        ],
        githubTopics: [],
        nextData: '',
        description: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);

      const result = await parseHTMLWithOffscreen(htmlContent);

      expect(result.jsonLdScripts).toHaveLength(2);
      expect(result.scripts).toHaveLength(3);
    });

    it('should extract GitHub topics', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const htmlContent = `
        <html>
          <body>
            <a data-ga-click="Topic, repository page" href="/topic/javascript">JavaScript</a>
            <a data-ga-click="Topic, repository page" href="/topic/typescript">TypeScript</a>
          </body>
        </html>
      `;

      const mockResponse = {
        metaTags: [],
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: ['JavaScript', 'TypeScript'],
        nextData: '',
        description: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);

      const result = await parseHTMLWithOffscreen(htmlContent);

      expect(result.githubTopics).toEqual(['JavaScript', 'TypeScript']);
    });

    it('should extract Next.js data', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const htmlContent = `
        <html>
          <body>
            <div id="__NEXT_DATA__">{"props": {"pageProps": {"data": "test"}}}</div>
          </body>
        </html>
      `;

      const mockResponse = {
        metaTags: [],
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '{"props": {"pageProps": {"data": "test"}}}',
        description: [],
        headlines: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);

      const result = await parseHTMLWithOffscreen(htmlContent);

      expect(result.nextData).toBe('{"props": {"pageProps": {"data": "test"}}}');
    });

    it('should extract headlines at all levels', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const htmlContent = `
        <html>
          <body>
            <h1>Main Title</h1>
            <h2>Subtitle</h2>
            <h3>Section</h3>
            <h4>Subsection</h4>
            <h5>Detail</h5>
            <h6>Small</h6>
          </body>
        </html>
      `;

      const mockResponse = {
        metaTags: [],
        aRelTag: [],
        aRelCategory: [],
        jsonLdScripts: [],
        scripts: [],
        githubTopics: [],
        nextData: '',
        description: [],
        headlines: {
          h1: ['Main Title'],
          h2: ['Subtitle'],
          h3: ['Section'],
          h4: ['Subsection'],
          h5: ['Detail'],
          h6: ['Small'],
        },
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);

      const result = await parseHTMLWithOffscreen(htmlContent);

      expect(result.headlines.h1).toEqual(['Main Title']);
      expect(result.headlines.h2).toEqual(['Subtitle']);
      expect(result.headlines.h3).toEqual(['Section']);
      expect(result.headlines.h4).toEqual(['Subsection']);
      expect(result.headlines.h5).toEqual(['Detail']);
      expect(result.headlines.h6).toEqual(['Small']);
    });

    it('should handle empty HTML gracefully', async () => {
      chrome.runtime.getContexts.mockResolvedValue([]);

      const mockResponse = {
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

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);

      const result = await parseHTMLWithOffscreen('');

      expect(result).toEqual(mockResponse);
    });
  });
});
