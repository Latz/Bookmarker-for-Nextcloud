// @ts-check
import { cacheGet } from '../../../lib/cache.js';
import { getOption } from '../../../lib/storage.js';

/**
 * Builds a lookup Set of lowercased stored keywords.
 *
 * Returns null when there is nothing to match against, which callers treat as
 * "no keywords survive reduction".
 *
 * @param {Array<string>|{ok: boolean}|undefined} allKeywordsRaw - Stored keyword list, or an API error object.
 * @returns {Set<string>|null} Lowercased lookup set, or null if unusable.
 */
export function buildKeywordLookup(allKeywordsRaw) {
  if (
    allKeywordsRaw === undefined ||
    Object.keys(allKeywordsRaw).length === 0 ||
    // no keywords on server, api returns an error
    allKeywordsRaw?.ok === false
  ) {
    return null;
  }
  return new Set(allKeywordsRaw.map((keyword) => keyword.toLowerCase()));
}

/**
 * Reduces an array of keywords by removing duplicates and filtering out
 * any keywords that are not present in the cache.
 *
 * @param {Array} keywords - An array of keywords to be reduced.
 * @param {boolean} [force] - Reduce even when the user disabled reduction.
 * @param {Set<string>|Array<string>|null} [cachedAllKeywords] - Pre-built lookup Set (preferred) or raw keyword array. Omit to read from the cache.
 * @param {boolean} [reduceEnabled] - Pre-fetched cbx_reduceKeywords, to avoid re-reading it in a loop.
 * @return {Promise<Array>} - An array of reduced keywords.
 */
export async function reduceKeywords(
  keywords,
  force = false,
  cachedAllKeywords = null,
  reduceEnabled = null,
) {
  const cbx_reduceKeywords =
    reduceEnabled ?? (await getOption('cbx_reduceKeywords'));

  if (force === false && cbx_reduceKeywords === false) {
    // if the user does not want to reduce the keywords, we return
    return keywords;
  }

  // A Set turns the per-word membership test below from a linear scan of the
  // whole stored keyword list into a hash lookup. Callers in a loop pass a
  // prebuilt Set so it is not rebuilt for every headline.
  let lookup;
  if (cachedAllKeywords instanceof Set) {
    lookup = cachedAllKeywords;
  } else {
    lookup = buildKeywordLookup(
      cachedAllKeywords ?? (await cacheGet('keywords')),
    );
  }
  if (lookup === null) return [];

  // dedupe first so the lookup runs once per distinct keyword
  const unique = [...new Set(keywords)];

  return unique.filter((keyword) => lookup.has(keyword.toLowerCase()));
}
