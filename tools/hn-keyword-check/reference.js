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

/**
 * @returns {{keywords: Object<string, string[]>, descriptions: Object<string, string>}}
 *   Found keywords and descriptions, grouped by the source they came from.
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

  for (const source of Object.keys(keywords)) {
    keywords[source] = [...new Set(keywords[source])];
  }
  return { keywords, descriptions };
}
