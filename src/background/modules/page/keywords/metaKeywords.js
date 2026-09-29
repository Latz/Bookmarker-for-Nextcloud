// @ts-check
import getMeta from '../getMeta.js';

// Meta sources, in the order their keywords are listed. article:tag holds one tag per meta element,
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
 * Extracts keywords from all of a page's keyword meta tags (keywords,
 * news_keywords, article:tag, etc.), splitting a single divider-separated
 * string per source. Duplicates are left to getKeywords' mergeKeywords.
 * @returns {Array<string>} Keywords found in meta tags, or [] if none.
 */
export function extractMetaKeywords(document) {
  return META_SOURCES.flatMap(({ type, id, splitOnSpace = true }) => {
    const metaKeywords = getMeta(document, { type, id });
    return metaKeywords.length > 0
      ? splitMetaKeywords(metaKeywords, splitOnSpace)
      : [];
  });
}

/**
 * Turns the raw values of one meta source into a clean keyword list.
 *
 * Several values (one meta element per tag) are used as they are. A single
 * value is split on the first divider found, in the order comma, semicolon,
 * space, `&amp;` -- comma wins because it is by far the most common separator
 * and a comma-separated list may itself contain spaces ("web design, css").
 * Quotes are stripped and whitespace trimmed at the end.
 *
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
  } else keywords = metaKeywords; // several values (or an empty one): already a list
  // `keywords` is still undefined when a divider was detected but no branch
  // above handled it; in that case nothing is returned.
  if (keywords) {
    keywords = keywords
      .map((keyword) => keyword.replaceAll('"', ''))
      .map((keyword) => keyword.trim());
  } else keywords = [];
  return keywords;
}
