// @ts-check

// schema.org Article and its subtypes. News sites mostly use NewsArticle,
// blogs BlogPosting (https://www.sciencenews.org/article/true-blue-rose-pigment-copigment).
const ARTICLE_TYPES = new Set([
  'Article',
  'AdvertiserContentArticle',
  'AnalysisNewsArticle',
  'APIReference',
  'AskPublicNewsArticle',
  'BackgroundNewsArticle',
  'BlogPosting',
  'DiscussionForumPosting',
  'LiveBlogPosting',
  'MedicalScholarlyArticle',
  'NewsArticle',
  'OpinionNewsArticle',
  'Report',
  'ReportageNewsArticle',
  'ReviewNewsArticle',
  'SatiricalArticle',
  'ScholarlyArticle',
  'SocialMediaPosting',
  'TechArticle',
]);

/**
 * @returns {boolean} Whether a JSON-LD node is an Article (or subtype); `@type` may be a string or an array.
 */
function isArticle(node) {
  const type = node?.['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => ARTICLE_TYPES.has(t));
}

/**
 * Finds keywords on a JSON-LD `@graph`-wrapped Article node.
 * https://harpers.org/archive/2024/07/art-and-artifice-donna-tartt/
 * @returns {Array|null} Keywords, or null if this shape doesn't apply.
 */
function extractKeywordsFromGraphArticle(jsonld) {
  const graph = jsonld['@graph'];
  const nodes = Array.isArray(graph) ? graph : [graph];
  const article = nodes.find(isArticle);
  if (!article) return null;
  // Route through the keywords-field parser so a plain string ("blue rose")
  // becomes an array instead of being handed on as a string. null (an Article
  // without usable keywords) must stay null: turning it into [] made the `??`
  // chain in extractKeywordsFromJsonLd skip the mainEntity fallback.
  return extractKeywordsFromKeywordsField(article);
}

/**
 * The text of one entry of a keywords array: a string as-is, CNN's
 * `{ termCode: { label } }`, or a schema.org DefinedTerm `{ name }`.
 * @returns {string|null}
 */
function keywordText(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  const text = entry.termCode?.label ?? entry.name;
  return typeof text === 'string' ? text : null;
}

/**
 * Extracts keywords from the shapes a JSON-LD `keywords` field appears in
 * across sites: an array (of strings, CNN termCode objects
 * https://edition.cnn.com/2023/04/25/world/lunar-lander-japan-uae-hakuto-r-scn/index.html
 * or DefinedTerm objects) or a comma-separated string. Anything else (a number,
 * an object, an empty array) is not keywords.
 * @returns {Array<string>|null} Keywords, or null when there are none.
 */
function extractKeywordsFromKeywordsField(jsonld) {
  const value = jsonld?.keywords;
  let keywords = null;
  if (Array.isArray(value)) {
    keywords = value.map(keywordText).filter((text) => text?.trim());
  } else if (typeof value === 'string') {
    keywords = value.split(',');
  }
  return keywords?.length > 0 ? keywords : null;
}

/**
 * Finds keywords on `mainEntity.keywords` (schema.org's alternate location).
 * https://www.nature.com/articles/d41586-024-00169-7
 * @returns {Array<string>|null} Keywords, or null if this shape doesn't apply.
 */
function extractKeywordsFromMainEntity(jsonld) {
  return extractKeywordsFromKeywordsField(jsonld?.mainEntity);
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
      const keywords = extractKeywordsFromJsonLd(parsed);
      // Pages usually carry several blocks (Organization, WebSite, Article,
      // ...); the first one that has keywords wins.
      if (keywords.length > 0) return keywords;
    } catch {
      continue;
    }
  }
  return [];
}
