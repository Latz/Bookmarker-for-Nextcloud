// @ts-check
import getMeta from '../getMeta.js';

/**
 * Extracts keywords from a page's meta tags (keywords, news_keywords,
 * article:tag, etc.), splitting a single divider-separated string when only
 * one meta value was found.
 * @returns {Array<string>} Keywords found in meta tags, or [] if none.
 */
export function extractMetaKeywords(document) {
  const metaKeywords = getMeta(
    document,
    { type: 'name', id: 'keywords' },
    { type: 'property', id: 'keywords' },
    { type: 'name', id: 'news_keywords' },
    { type: 'property', id: 'article:tag' },
    { type: 'property', id: 'og:article:tag' },
    { type: 'itemprop', id: 'keywords' },
    { type: 'name', id: 'sailthru.tags' },
    { type: 'name', id: 'parsely-tags' },
    { type: 'http-equiv', id: 'keywords' },
  );

  if (metaKeywords.length === 0) {
    return [];
  }

  let keywords;
  // If there is exactly one keywords string it might be a collection of keywords devided by comma, semicolo, or spaces
  // Try these possibilities otherwise return given keyword string
  // TODO: Vielleicht erst Wörter zwischen Anführungszeichen raus suchen
  if (metaKeywords.length === 1 && metaKeywords[0]) {
    const dividers = [',', ';', '&amp;', ' '];
    if (dividers.some((v) => metaKeywords[0].includes(v))) {
      // https://www.heise.de
      if (metaKeywords[0].includes(',')) keywords = metaKeywords[0].split(',');
      else if (metaKeywords[0].includes(';'))
        keywords = metaKeywords[0].split(';');
      else if (metaKeywords[0].includes(' '))
        keywords = metaKeywords[0].split(' ');
      else if (metaKeywords[0].includes('&amp;'))
        // https://www.epa.gov/mold/mold-course-introduction
        keywords = metaKeywords[0].split(/&amp;/g);
    }
  } else keywords = metaKeywords;
  if (keywords) {
    keywords = keywords
      .map((keyword) => keyword.replaceAll('"', ''))
      .map((keyword) => keyword.trim());
  } else keywords = [];
  return keywords;
}
