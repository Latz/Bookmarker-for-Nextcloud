// @ts-check
import getMeta from '../getMeta.js';

// Meta sources in priority order. article:tag holds one tag per meta element,
// and tags are often several words ("Fatty Liver Disease",
// https://nourishedbyscience.com/keto_and_liverfat/), so a lone value there is
// never split on spaces.
const META_SOURCES = [
  { type: 'name', id: 'keywords' },
  { type: 'property', id: 'keywords' },
  { type: 'name', id: 'news_keywords' },
  { type: 'property', id: 'article:tag', splitOnSpace: false },
  { type: 'property', id: 'og:article:tag', splitOnSpace: false },
  { type: 'itemprop', id: 'keywords' },
  { type: 'name', id: 'sailthru.tags' },
  { type: 'name', id: 'parsely-tags' },
  { type: 'http-equiv', id: 'keywords' },
];

/**
 * Extracts keywords from a page's meta tags (keywords, news_keywords,
 * article:tag, etc.), splitting a single divider-separated string when only
 * one meta value was found.
 * @returns {Array<string>} Keywords found in meta tags, or [] if none.
 */
export function extractMetaKeywords(document) {
  for (const { type, id, splitOnSpace = true } of META_SOURCES) {
    const metaKeywords = getMeta(document, { type, id });
    if (metaKeywords.length > 0) {
      return splitMetaKeywords(metaKeywords, splitOnSpace);
    }
  }
  return [];
}

/**
 * @param {Array<string>} metaKeywords - Values of the first matching meta source.
 * @param {boolean} splitOnSpace - Whether a lone value may be split on spaces.
 * @returns {Array<string>}
 */
function splitMetaKeywords(metaKeywords, splitOnSpace) {
  let keywords;
  // If there is exactly one keywords string it might be a collection of keywords devided by comma, semicolo, or spaces
  // Try these possibilities otherwise return given keyword string
  // TODO: Vielleicht erst Wörter zwischen Anführungszeichen raus suchen
  if (metaKeywords.length === 1 && metaKeywords[0]) {
    const dividers = [',', ';', '&amp;'];
    if (splitOnSpace) dividers.push(' ');
    if (dividers.some((v) => metaKeywords[0].includes(v))) {
      // https://www.heise.de
      if (metaKeywords[0].includes(',')) keywords = metaKeywords[0].split(',');
      else if (metaKeywords[0].includes(';'))
        keywords = metaKeywords[0].split(';');
      else if (splitOnSpace && metaKeywords[0].includes(' '))
        keywords = metaKeywords[0].split(' ');
      else if (metaKeywords[0].includes('&amp;'))
        // https://www.epa.gov/mold/mold-course-introduction
        keywords = metaKeywords[0].split(/&amp;/g);
    } else {
      // A lone keyword without dividers, e.g. <meta property="article:tag" content="self-hosting">
      // (https://david.alvarezrosa.com/posts/self-hosting-on-the-dark-web/)
      keywords = [metaKeywords[0]];
    }
  } else keywords = metaKeywords;
  if (keywords) {
    keywords = keywords
      .map((keyword) => keyword.replaceAll('"', ''))
      .map((keyword) => keyword.trim());
  } else keywords = [];
  return keywords;
}
