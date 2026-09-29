// @ts-check
import { getOptions } from '../../../lib/storage.js';
import log from '../../../lib/log.js';
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

// Sanity bounds. Sources like a[rel=tag] can yield whole card texts or hundreds
// of links on listing pages, which are not tags and would flood Tagify.
const MAX_KEYWORDS = 100;
const MAX_KEYWORD_LENGTH = 100;

/**
 * Trims keywords and drops empty entries, non-strings, over-long entries
 * (not tags) and case-insensitive duplicates, keeping the first spelling
 * seen. At most MAX_KEYWORDS are returned.
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
    if (!trimmed || trimmed.length > MAX_KEYWORD_LENGTH || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(trimmed);
    if (merged.length >= MAX_KEYWORDS) break;
  }
  return merged;
}

/**
 * Determines the keyword suggestions for a page.
 *
 * Strategy, from most to least reliable:
 *  1. Ask every structured source (meta tags, rel=tag links, JSON-LD, GTM,
 *     GitHub topics, Next.js data, IEEE data) and merge what they return.
 *  2. If none found anything, use the loose brute-force search result.
 *  3. If there are still no keywords and the user enabled "extended
 *     keywords", match words of the description/headlines against the
 *     keywords already stored on the server.
 * Steps 1 and 2 are then filtered by reduceKeywords (only keywords that exist
 * on the server are kept) unless the user turned that off.
 *
 * @param {Object} parsedData - Values read in-page by extractPageData.
 * @param {any} document - The (mock) document built from the page HTML.
 * @returns {Promise<Array<string>>} Keywords, or [] if the user disabled
 *   automatic tags or nothing was found.
 */
export default async function getKeywords(parsedData, document) {
  // Every source is asked; their keywords are merged in this order (earlier
  // sources win when the same keyword appears in several). Each source is a
  // function so that one throwing can be caught individually below.
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

  // The user switched automatic keywords off entirely.
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
