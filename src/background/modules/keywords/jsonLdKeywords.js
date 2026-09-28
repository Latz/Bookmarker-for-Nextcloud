// @ts-check

/**
 * Finds keywords on a JSON-LD `@graph`-wrapped Article node.
 * https://harpers.org/archive/2024/07/art-and-artifice-donna-tartt/
 * @returns {Array|null} Keywords, or null if this shape doesn't apply.
 */
function extractKeywordsFromGraphArticle(jsonld) {
  if (jsonld['@graph'] && Array.isArray(jsonld['@graph'])) {
    for (const element of jsonld['@graph']) {
      if (element['@type'] === 'Article') {
        return element['keywords'] || [];
      }
    }
  }
  if (jsonld['@graph']?.['@type'] === 'Article') {
    return jsonld['@graph']['keywords'] || [];
  }
  return null;
}

/**
 * Extracts keywords from the various shapes a JSON-LD `keywords` field
 * appears in across sites: array, plain string, CNN's termCode objects,
 * comma-separated string, or `tag:value` prefixed entries.
 * @returns {Array|null} Keywords, or null when `jsonld.keywords` is absent.
 */
function extractKeywordsFromKeywordsField(jsonld) {
  if (!jsonld.keywords) return null;

  //https://edition.cnn.com/2023/04/25/world/lunar-lander-japan-uae-hakuto-r-scn/index.html
  // CNN lists keywords as `[{ termCode: { label } }]`. This has to be checked
  // before the plain-array case below: that one returns any array as-is, which
  // handed these objects on to reduceKeywords (`keyword.toLowerCase()` on an
  // object throws). The `typeof` guard keeps Object.hasOwn away from
  // primitives, and `keywords[0]` can be undefined when `keywords` is an
  // object with a truthy `length` but no index 0.
  const first = jsonld.keywords[0];
  if (first && typeof first === 'object' && Object.hasOwn(first, 'termCode')) {
    const terms = [];
    jsonld.keywords.forEach((term) => {
      if (term?.termCode?.label) terms.push(term.termCode.label);
    });
    return terms;
  }

  if (jsonld.keywords.length > 0) {
    if (Array.isArray(jsonld.keywords)) {
      return jsonld.keywords;
    }
    if (typeof jsonld.keywords === 'string') {
      return jsonld.keywords.split(',');
    }
  }
  const keywords = jsonld.keywords.split(',').map((keyword) => keyword.trim());
  if (Array.isArray(keywords)) {
    return keywords;
  }
  const tags = [];
  jsonld.keywords?.forEach((keyword) => {
    const [id, value] = keyword.split(':');
    if (id.toLowerCase() === 'tag') tags.push(value);
  });
  if (tags.length > 0) {
    return tags;
  }
  // keywords are only comma separated Array
  // https://www.vox.com/platform/amp/down-to-earth/22679378/tree-planting-forest-restoration-climate-solutions
  return jsonld.keywords;
}

/**
 * Finds keywords on `mainEntity.keywords` (schema.org's alternate location).
 * https://www.nature.com/articles/d41586-024-00169-7
 * @returns {Array|null} Keywords, or null if this shape doesn't apply.
 */
function extractKeywordsFromMainEntity(jsonld) {
  if (
    jsonld?.mainEntity?.keywords?.length > 0 &&
    Array.isArray(jsonld.mainEntity.keywords)
  ) {
    return jsonld.mainEntity.keywords;
  }
  return null;
}

/**
 * Extracts keywords from one parsed JSON-LD value: an object, or a top-level
 * array of objects (e.g. `[{ "@type": "NewsArticle", ... }]`), in which case
 * the first item that yields keywords wins.
 */
export function extractKeywordsFromJsonLd(jsonld) {
  if (Array.isArray(jsonld)) {
    for (const item of jsonld) {
      if (!item || typeof item !== 'object') continue;
      try {
        const keywords = extractKeywordsFromJsonLd(item);
        if (keywords.length > 0) return keywords;
      } catch {
        // one oddly shaped item must not hide the keywords of the others
        continue;
      }
    }
    return [];
  }
  return (
    extractKeywordsFromGraphArticle(jsonld) ??
    extractKeywordsFromKeywordsField(jsonld) ??
    extractKeywordsFromMainEntity(jsonld) ??
    []
  );
}

/**
 * Looks through the page's `<script type="application/ld+json">` blocks for
 * keywords.
 * @returns {Array} Keywords, or [] if none were found.
 */
export function extractJsonLdKeywords(document) {
  let keywords = [];
  const jsonlds = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  for (const jsonldEl of jsonlds) {
    if (!jsonldEl) continue;
    try {
      // extractKeywordsFromJsonLd is inside the try, not just JSON.parse:
      // structured data can be valid JSON but still shaped in a way that
      // throws inside extraction (see the hasOwn note above). A crash here
      // must not take down keyword extraction for the whole page -- move
      // on to the next script instead.
      const parsed = JSON.parse(jsonldEl.innerText);
      keywords = extractKeywordsFromJsonLd(parsed);
    } catch {
      continue;
    }
    if (keywords.length === 0) break;
  }
  return keywords;
}
