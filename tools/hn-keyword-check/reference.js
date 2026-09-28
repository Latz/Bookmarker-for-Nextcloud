// Independent keyword/description detector. Deliberately naive and broad:
// it looks everywhere a page commonly declares tags, without the extension's
// "first source wins" ordering, so it can tell us what the extension misses.

const KEYWORD_METAS = [
  ['name', 'keywords'],
  ['name', 'news_keywords'],
  ['property', 'article:tag'],
  ['property', 'og:article:tag'],
  ['name', 'parsely-tags'],
  ['name', 'sailthru.tags'],
  ['itemprop', 'keywords'],
];

const DESCRIPTION_METAS = [
  ['name', 'description'],
  ['property', 'og:description'],
  ['name', 'twitter:description'],
  // getDescription.js also checks these two (plus a couple of rarer,
  // non-meta-scoped fallbacks left out here). Some sites use `name` where
  // `property` is standard, e.g. jimmyhmiller.com's <meta name="og:description">.
  ['name', 'og:description'],
  ['http-equiv', 'description'],
];

function metaValues(document, attr, value) {
  return Array.from(document.querySelectorAll('meta'))
    .filter((meta) => meta.getAttribute(attr)?.toLowerCase() === value)
    .map((meta) => meta.getAttribute('content')?.trim())
    .filter(Boolean);
}

function splitList(value) {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function keywordValues(value) {
  if (typeof value === 'string') return splitList(value);
  if (Array.isArray(value)) return value.flatMap(keywordValues);
  if (value && typeof value === 'object') {
    // e.g. CNN's { termCode: { label } } or DefinedTerm { name }
    const label = value.termCode?.label ?? value.name ?? value.label;
    return typeof label === 'string' ? [label.trim()] : [];
  }
  return [];
}

function parseJsonLd(document) {
  const blocks = [];
  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      blocks.push(JSON.parse(script.textContent));
    } catch {
      // invalid JSON-LD is common; ignore it
    }
  }
  return blocks;
}

// Recursively collects every value stored under `key` anywhere in the tree.
function collectKey(node, key, out = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collectKey(child, key, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      else collectKey(v, key, out);
    }
  }
  return out;
}

// Inline config such as {"keywords":"a,b"}, {"keywords":["a","b"]} or
// keywords: "a|b" inside a <script> (Guardian, Variety, Ars Technica).
const INLINE_KEYWORDS = /["']?keywords["']?\s*:\s*(?:"([^"]*)"|\[([^\]]*)\])/g;

function inlineScriptKeywords(document) {
  const scripts = document.querySelectorAll(
    'script:not([type="application/ld+json"])',
  );
  for (const script of scripts) {
    for (const [, text, list] of (script.textContent ?? '').matchAll(
      INLINE_KEYWORDS,
    )) {
      const found = (
        text === undefined
          ? Array.from(list.matchAll(/"([^"]*)"/g), (m) => m[1])
          : text.split(/[,;|]/)
      )
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      if (found.length) return found;
    }
  }
  return [];
}

// Links like /tag/agents/, /topics/ai/, or NPR's /tags/133775819/schools
// (a numeric id segment before the slug) on the page's own site. Many sites
// list their tags this way without rel="tag"; too noisy to count as keywords
// (navigation, related topics), so they are only reported as a hint. A
// non-numeric middle segment (e.g. /tags/foo/bar) is more likely a category
// hierarchy than a single tag, so it's left unmatched.
const TAG_LINK_PATH = /^\/(?:tags?|topics?|t)\/(?:\d+\/)?[^/]+\/?$/i;

// Above this length, a[href] textContent is more likely a whole card
// (title + description + stats, all inside one link -- e.g. hackeratlas.com's
// "AI governance and societal impactsAI safety, governance, regulation...")
// than a short tag label, so the URL slug is used instead.
const MAX_TAG_TEXT_LENGTH = 60;

/** @returns {string} The last path segment, extension stripped, - and _ -> space. */
function slugFromPath(pathname) {
  const last = pathname.split('/').filter(Boolean).at(-1) ?? '';
  return last.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
}

function tagLinkHints(document) {
  const base = document.location?.href || 'https://example.invalid/';
  const host = new URL(base).hostname;
  const texts = [];
  for (const a of document.querySelectorAll('a[href]')) {
    try {
      const url = new URL(a.getAttribute('href'), base);
      if (url.hostname !== host || !TAG_LINK_PATH.test(url.pathname)) continue;
      const text = a.textContent.trim();
      if (!text) continue;
      texts.push(
        text.length <= MAX_TAG_TEXT_LENGTH ? text : slugFromPath(url.pathname),
      );
    } catch {
      // unparsable href
    }
  }
  return [...new Set(texts.filter(Boolean))];
}

/**
 * @returns {{keywords: Object<string, string[]>, descriptions: Object<string, string>, hints: Object<string, string[]>}}
 *   Found keywords and descriptions, grouped by the source they came from.
 *   `hints` lists weak signals that are not counted as keywords.
 */
export function detectReference(document) {
  const keywords = {};
  const descriptions = {};

  for (const [attr, value] of KEYWORD_METAS) {
    const found = metaValues(document, attr, value).flatMap(splitList);
    if (found.length) keywords[`meta[${attr}=${value}]`] = found;
  }

  for (const rel of ['tag', 'category']) {
    const found = Array.from(document.querySelectorAll(`a[rel~=${rel}]`))
      .map((a) => a.textContent.trim())
      .filter(Boolean);
    if (found.length) keywords[`a[rel=${rel}]`] = found;
  }

  const jsonLd = parseJsonLd(document);
  const jsonLdKeywords = collectKey(jsonLd, 'keywords').flatMap(keywordValues);
  if (jsonLdKeywords.length) keywords['json-ld keywords'] = jsonLdKeywords;

  for (const [attr, value] of DESCRIPTION_METAS) {
    const [found] = metaValues(document, attr, value);
    if (found) descriptions[`meta[${attr}=${value}]`] = found;
  }
  const [jsonLdDescription] = collectKey(jsonLd, 'description').filter(
    (d) => typeof d === 'string' && d.trim(),
  );
  if (jsonLdDescription) descriptions['json-ld description'] = jsonLdDescription;

  // Loose, so only a fallback when nothing else declared keywords -- the same
  // rule the extension applies to its brute-force search.
  if (Object.keys(keywords).length === 0) {
    const inline = inlineScriptKeywords(document);
    if (inline.length) keywords['inline-script keywords'] = inline;
  }

  const hints = {};
  const tagLinks = tagLinkHints(document);
  if (tagLinks.length) hints['tag links'] = tagLinks;

  for (const source of Object.keys(keywords)) {
    keywords[source] = [...new Set(keywords[source])];
  }
  return { keywords, descriptions, hints };
}
