// Link sources for the keyword checker: each returns absolute http(s) URLs of
// the pages worth checking. The parse* functions are pure so they can be
// unit-tested (tests/checkerSources.test.js); collectUrls does the fetching.
//
// Uses jsdom, not happy-dom: happy-dom's HTML parser was found to silently
// truncate real-world pages with malformed markup (e.g. domainnamewire.com --
// stopped building the DOM after a stray `<meta ></span>`, losing most of the
// page's links) instead of recovering the way a real browser does. jsdom is
// slower but implements the HTML5 parsing spec's error recovery, which this
// tool depends on since it parses arbitrary external pages, not controlled
// fixtures.
import { JSDOM, VirtualConsole } from 'jsdom';

// An empty VirtualConsole, not wired to sendTo(console) -- jsdom's default
// console forwards its own parse warnings (e.g. "Could not parse CSS
// stylesheet" on real-world pages with malformed inline <style> content) to
// the real console. Harmless and expected; this tool never touches CSS.
const silentConsole = new VirtualConsole();

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const TIMEOUT_MS = 15000;

export const SOURCE_NAMES = ['hn', 'lobsters', 'devto', 'algolia'];

const HN_URL = 'https://news.ycombinator.com/';
const PER_PAGE = 30;

export async function fetchWithUa(url, accept = 'text/html,*/*;q=0.8') {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** @returns {string|null} Absolute http(s) URL, or null for anything else. */
function toHttpUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const compact = (urls) => urls.filter(Boolean);

function withDocument(html, base, fn) {
  // No `runScripts`/`resources` options set -- jsdom then never executes
  // scripts or fetches subresources, matching the old disableJavaScript*/
  // disableCSSFileLoading happy-dom settings.
  const dom = new JSDOM(html, { url: base, virtualConsole: silentConsole });
  try {
    return fn(dom.window.document);
  } catch {
    return [];
  } finally {
    dom.window.close();
  }
}

/** HN listing page. Ask/Show HN text posts link back to HN and are skipped. */
export function parseHnHtml(html, base = HN_URL) {
  return withDocument(html, base, (document) =>
    compact(
      Array.from(document.querySelectorAll('.titleline > a'))
        .map((a) => toHttpUrl(a.getAttribute('href'), base))
        .filter((url) => url && !url.startsWith(`${HN_URL}item?`)),
    ),
  );
}

/** lobste.rs story list; text posts have an empty url. */
export function parseLobsters(json) {
  return Array.isArray(json)
    ? compact(json.map((story) => toHttpUrl(story?.url)))
    : [];
}

/** dev.to /api/articles. */
export function parseDevto(json) {
  return Array.isArray(json)
    ? compact(json.map((article) => toHttpUrl(article?.url)))
    : [];
}

/** hn.algolia.com search response; stories without a url are dropped. */
export function parseAlgolia(json) {
  return Array.isArray(json?.hits)
    ? compact(json.hits.map((hit) => toHttpUrl(hit?.url)))
    : [];
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? match;
    const code =
      entity[1].toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
    return Number.isNaN(code) ? match : String.fromCodePoint(code);
  });
}

/** Text of a feed element, unwrapping a CDATA section and entities. */
function feedText(raw) {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return cdata ? cdata[1].trim() : decodeEntities(raw).trim();
}

/**
 * RSS 2.0 (`<item><link>url</link>`) or Atom (`<entry><link rel="alternate"
 * href="url"/>`). happy-dom's XML parser drops most items in real-world feeds,
 * so this scans the item/entry blocks with regexes instead; a link is all it
 * needs.
 */
export function parseFeed(xml, base) {
  const urls = [];
  for (const [, , block] of String(xml).matchAll(
    /<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi,
  )) {
    let link = null;
    // Atom: <link href="..." rel="alternate"/> (rel defaults to alternate)
    for (const [, attrs] of block.matchAll(/<link\s([^>]*?)\/?>/gi)) {
      const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
      const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
      if (href && (rel ?? 'alternate') === 'alternate') {
        link = decodeEntities(href);
        break;
      }
    }
    // RSS: <link>url</link> (atom:link etc. have a namespace prefix and don't match)
    link ??= /<link>([\s\S]*?)<\/link>/i.exec(block)?.[1];
    if (link) urls.push(toHttpUrl(feedText(link), base));
  }
  return compact(urls);
}

// ---------------------------------------------------------------------------
// Helpers for combining sources
// ---------------------------------------------------------------------------

const withoutFragment = (url) => url.split('#')[0];

/** Drops repeats (ignoring #fragments), keeping the first occurrence. */
export function dedupeUrls(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const key = withoutFragment(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Removes URLs that appear in `excluded` (ignoring #fragments). */
export function excludeUrls(urls, excluded) {
  const skip = new Set([...excluded].map(withoutFragment));
  return urls.filter((url) => !skip.has(withoutFragment(url)));
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

// One entry per --source: builds the page URL and parses the response body.
// `page` is 1-based.
const SOURCES = {
  hn: {
    url: (page) => `${HN_URL}news?p=${page}`,
    parse: async (response) => parseHnHtml(await response.text()),
  },
  lobsters: {
    url: (page) => `https://lobste.rs/hottest.json?page=${page}`,
    parse: async (response) => parseLobsters(await response.json()),
  },
  devto: {
    url: (page) =>
      `https://dev.to/api/articles?per_page=${PER_PAGE}&top=7&page=${page}`,
    parse: async (response) => parseDevto(await response.json()),
  },
  algolia: {
    url: (page) =>
      `https://hn.algolia.com/api/v1/search_by_date?${new URLSearchParams({
        tags: 'story',
        numericFilters: 'points>50',
        hitsPerPage: String(PER_PAGE),
        page: String(page - 1), // Algolia pages are 0-based
      })}`,
    parse: async (response) => parseAlgolia(await response.json()),
  },
};

/**
 * @param {{sources: string[], feeds: string[], pages: number}} options
 * @returns {Promise<Array<{name: string, urls: string[], error?: string}>>}
 *   One entry per source/feed, so a failing source doesn't lose the others.
 */
export async function collectUrls({ sources, feeds, pages }) {
  const results = [];

  for (const name of sources) {
    const source = SOURCES[name];
    if (!source) throw new Error(`Unknown source "${name}"`);
    const urls = [];
    let error;
    for (let page = 1; page <= pages; page++) {
      try {
        const accept = name === 'hn' ? undefined : 'application/json';
        const response = await fetchWithUa(source.url(page), accept);
        urls.push(...(await source.parse(response)));
      } catch (e) {
        error = `page ${page}: ${e.message}`;
        break;
      }
    }
    results.push({ name, urls, ...(error && { error }) });
  }

  for (const feed of feeds) {
    try {
      const response = await fetchWithUa(
        feed,
        'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8',
      );
      results.push({
        name: `feed ${feed}`,
        urls: parseFeed(await response.text(), response.url),
      });
    } catch (e) {
      results.push({ name: `feed ${feed}`, urls: [], error: e.message });
    }
  }

  return results;
}
