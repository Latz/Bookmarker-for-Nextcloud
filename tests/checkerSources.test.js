/**
 * Unit tests for the link-source parsers of tools/hn-keyword-check
 */
import { describe, it, expect } from 'vitest';
import {
  dedupeUrls,
  excludeUrls,
  parseAlgolia,
  parseDevto,
  parseFeed,
  parseHnHtml,
  parseLobsters,
} from '../tools/hn-keyword-check/sources.js';

describe('parseHnHtml', () => {
  it('reads story links and skips HN-internal item links', () => {
    const html = `
      <span class="titleline"><a href="https://a.example/post">A</a></span>
      <span class="titleline"><a href="item?id=123">Ask HN: something</a></span>
      <span class="titleline"><a href="https://b.example/">B</a></span>`;

    expect(parseHnHtml(html)).toEqual([
      'https://a.example/post',
      'https://b.example/',
    ]);
  });

  it('returns [] for a page without stories', () => {
    expect(parseHnHtml('<html><body></body></html>')).toEqual([]);
  });
});

describe('JSON source parsers', () => {
  it('parseLobsters drops text posts with an empty url', () => {
    const json = [{ url: 'https://a.example/' }, { url: '' }, {}];

    expect(parseLobsters(json)).toEqual(['https://a.example/']);
  });

  it('parseDevto maps article urls', () => {
    expect(parseDevto([{ url: 'https://dev.to/u/post' }])).toEqual([
      'https://dev.to/u/post',
    ]);
  });

  it('parseAlgolia drops hits without a url', () => {
    const json = { hits: [{ url: 'https://a.example/' }, { url: null }] };

    expect(parseAlgolia(json)).toEqual(['https://a.example/']);
  });

  it('return [] for unexpected shapes', () => {
    expect(parseLobsters({ error: 'x' })).toEqual([]);
    expect(parseDevto(null)).toEqual([]);
    expect(parseAlgolia({})).toEqual([]);
  });

  it('ignore non-http(s) urls', () => {
    expect(
      parseLobsters([{ url: 'javascript:alert(1)' }, { url: 'ftp://x/y' }]),
    ).toEqual([]);
  });
});

describe('parseFeed', () => {
  it('reads RSS links, unwrapping CDATA and entities', () => {
    const xml = `<rss><channel>
      <link>https://site.example/</link>
      <item><title>a</title><link>https://a.example/x?a=1&amp;b=2</link></item>
      <item><link><![CDATA[https://b.example/post]]></link></item>
    </channel></rss>`;

    expect(parseFeed(xml)).toEqual([
      'https://a.example/x?a=1&b=2',
      'https://b.example/post',
    ]);
  });

  it('ignores namespaced atom:link inside RSS items', () => {
    const xml = `<rss><channel><item>
      <atom:link href="https://self.example/feed" rel="self"/>
      <link>https://a.example/</link>
    </item></channel></rss>`;

    expect(parseFeed(xml)).toEqual(['https://a.example/']);
  });

  it('reads the alternate link of Atom entries, skipping rel=self', () => {
    const xml = `<feed>
      <link href="https://site.example/" rel="alternate"/>
      <entry>
        <link rel="self" href="https://self.example/entry"/>
        <link href="https://a.example/post" rel="alternate" type="text/html"/>
      </entry>
      <entry><link href="https://b.example/"/></entry>
    </feed>`;

    expect(parseFeed(xml)).toEqual([
      'https://a.example/post',
      'https://b.example/',
    ]);
  });

  it('resolves relative links against the feed url', () => {
    const xml = '<rss><item><link>/posts/1</link></item></rss>';

    expect(parseFeed(xml, 'https://site.example/feed.xml')).toEqual([
      'https://site.example/posts/1',
    ]);
  });

  it('skips items without a usable link', () => {
    const xml = `<rss>
      <item><title>no link</title></item>
      <item><link>mailto:a@b.example</link></item>
    </rss>`;

    expect(parseFeed(xml)).toEqual([]);
  });

  it('returns [] for non-feed input', () => {
    expect(parseFeed('<html><body>hi</body></html>')).toEqual([]);
    expect(parseFeed('')).toEqual([]);
  });
});

describe('dedupeUrls', () => {
  it('keeps the first occurrence and ignores #fragments', () => {
    expect(
      dedupeUrls([
        'https://a.example/x',
        'https://b.example/',
        'https://a.example/x#comments',
        'https://a.example/x',
      ]),
    ).toEqual(['https://a.example/x', 'https://b.example/']);
  });
});

describe('excludeUrls', () => {
  it('removes urls seen in a previous run, ignoring #fragments', () => {
    expect(
      excludeUrls(
        ['https://a.example/', 'https://b.example/'],
        ['https://a.example/#top'],
      ),
    ).toEqual(['https://b.example/']);
  });

  it('keeps everything when nothing was excluded', () => {
    expect(excludeUrls(['https://a.example/'], [])).toEqual([
      'https://a.example/',
    ]);
  });
});
