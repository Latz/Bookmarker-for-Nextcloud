// @ts-check
import { cacheGet } from '../../../../lib/cache.js';
import { getOption } from '../../../../lib/storage.js';
import log from '../../../../lib/log.js';
import getDescription from '../getDescription.js';
import { buildKeywordLookup, reduceKeywords } from './reduceKeywords.js';

const DEBUG = false;

/**
 * Scans headlines from h1 up to hMaxLevel for words matching stored
 * keywords, level by level, stopping at the first headline that matches.
 * @returns {Promise<Array<string>>} Reduced keywords, or [] if none matched.
 */
async function findKeywordsInHeadlines(
  document,
  maxLevel,
  keywordLookup,
  reduceEnabled,
) {
  let level = 1;
  while (level <= maxLevel) {
    const headlines = document.querySelectorAll(`h${level}`);

    for (const headline of headlines) {
      const words = headline.innerText.split(/[\W_]+/g);
      const reducedKw = await reduceKeywords(
        words,
        true,
        keywordLookup,
        reduceEnabled,
      );
      if (reducedKw && reducedKw.length > 0) {
        return reducedKw;
      }
    }
    level++;
  }
  return [];
}

/**
 * Last resort: match parts of the description, then of the headlines, with
 * the stored keywords.
 *
 * @param {any} document - The (mock) document.
 * @param {number} maxHeadingLevel - Deepest heading level to scan (input_headings_slider).
 * @returns {Promise<Array<string>>} Matching stored keywords, or [] if none matched.
 */
export async function findExtendedKeywords(document, maxHeadingLevel) {
  // Build the lookup once for all extended-mode reduce calls below. Previously
  // the raw list was re-lowercased on every call, once per headline.
  const keywordLookup = buildKeywordLookup(await cacheGet('keywords'));
  // force === true below, so cbx_reduceKeywords never gates these calls; pass
  // it explicitly anyway so reduceKeywords does not re-read it per headline.
  const reduceEnabled = await getOption('cbx_reduceKeywords');

  // --- description ---
  log(DEBUG, 'Description');
  const description = getDescription(document);
  if (description.length > 0) {
    const words = description.split(/[\W_]+/g);
    const keywords = await reduceKeywords(
      words,
      true,
      keywordLookup,
      reduceEnabled,
    );
    if (keywords.length > 0) {
      return keywords;
    }
  }

  // --- headlines ---
  log(DEBUG, 'Headlines');
  return findKeywordsInHeadlines(
    document,
    maxHeadingLevel,
    keywordLookup,
    reduceEnabled,
  );
}
