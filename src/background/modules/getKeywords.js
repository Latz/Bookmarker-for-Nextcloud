// @ts-check
import { getOptions } from '../../lib/storage.js';
import log from '../../lib/log.js';
import { reduceKeywords } from './keywords/reduceKeywords.js';
import { extractJsonLdKeywords } from './keywords/jsonLdKeywords.js';
import { extractMetaKeywords } from './keywords/metaKeywords.js';
import {
  extractGithubKeywords,
  extractGtmKeywords,
  extractNextDataKeywords,
  extractRelCategoryKeywords,
  extractRelTagKeywords,
} from './keywords/pageSources.js';
import { findExtendedKeywords } from './keywords/extendedKeywords.js';

const DEBUG = false;

// Keyword sources that still need finding are listed in
// docs/keyword-sources-todo.md.

/**
 * Trims keywords and drops empty entries, non-strings, and case-insensitive
 * duplicates, keeping the first spelling seen.
 * @param {Array<any>} keywords
 * @returns {Array<string>}
 */
export function mergeKeywords(keywords) {
  const seen = new Set();
  const merged = [];
  for (const keyword of keywords) {
    if (typeof keyword !== 'string') continue;
    const trimmed = keyword.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

export default async function getKeywords(parsedData, document) {
  // Every source is asked; their keywords are merged in this order.
  const sources = [
    () => extractMetaKeywords(document),
    () => extractRelTagKeywords(document),
    () => extractRelCategoryKeywords(document),
    () => extractJsonLdKeywords(document),
    () => extractGtmKeywords(document),
    () => extractGithubKeywords(document),
    () => extractNextDataKeywords(document),
    // xplGlobal.document.metadata -> https://ieeexplore.ieee.org/document/10243497
    // Extraction (including the JSON.parse and error handling) now runs
    // in-page inside extractPageData -- this is a pure field read.
    () => parsedData.xplKeywords ?? [],
  ];

  // OPTIMIZATION: Batch fetch all options upfront to avoid multiple storage reads
  const options = await getOptions([
    'cbx_autoTags',
    'cbx_extendedKeywords',
    'input_headings_slider',
  ]);

  if (!options.cbx_autoTags) return [];

  // Collect the keywords of all sources, so tags declared in more than one
  // place (meta keywords, article:tag, JSON-LD, ...) all end up in Tagify.
  const found = [];
  for (const source of sources) {
    try {
      const keywords = source();
      log(DEBUG, '🚀 ~ keywords:', keywords);
      if (Array.isArray(keywords)) found.push(...keywords);
    } catch (error) {
      // A source choking on odd page data must not drop the others' keywords
      log(DEBUG, 'Keyword source failed, skipping:', error);
    }
  }

  // Brute force search for a keywords property in inline script data (see
  // extractPageData). It is loose enough to pick up unrelated config values,
  // so it only counts when no real source found anything.
  const keywords = mergeKeywords(
    found.length > 0 ? found : (parsedData.bruteForceKeywords ?? []),
  );
  if (keywords.length > 0) {
    // use only keywords that are already stored in Bookmarks
    // switchable by Options/Advanced
    return reduceKeywords(keywords);
  }

  // --- Last resort: Try to match parts of description or headlines with stored keywords ---

  // If the user does not want to use this feature, return an empty array
  log(
    DEBUG,
    ':: ~ getKeywords ~ extendedKeywords:',
    options.cbx_extendedKeywords,
  );
  if (!options.cbx_extendedKeywords) return [];
  log(DEBUG, 'Extended Keywords!');

  return findExtendedKeywords(document, options.input_headings_slider);
}
