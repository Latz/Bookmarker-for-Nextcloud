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

export default async function getKeywords(parsedData, document) {
  // define an array of function whcih can be looped through later and
  // break if a function found keywords
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
    // Brute force search for pattern /keywords: "keyword1, keyword2, keyword3"/
    // Same as above: the regex now runs in-page.
    () => parsedData.bruteForceKeywords ?? [],
  ];

  // OPTIMIZATION: Batch fetch all options upfront to avoid multiple storage reads
  const options = await getOptions([
    'cbx_autoTags',
    'cbx_extendedKeywords',
    'input_headings_slider',
  ]);

  if (!options.cbx_autoTags) return [];

  // Loop through the various sources; the first one that finds anything wins
  for (const source of sources) {
    const keywords = source();
    log(DEBUG, '🚀 ~ keywords:', keywords);

    // use only keywords that are already stored in Bookmarks
    // switchable by Options/Advanced
    if (keywords && keywords.length > 0) {
      return reduceKeywords(keywords);
    }
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
