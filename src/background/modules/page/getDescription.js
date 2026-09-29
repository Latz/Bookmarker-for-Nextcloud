import getMeta from './getMeta.js';
// ------------------------------------------------------------------------------------------
/**
 * Extracts a short description of the page from its meta tags.
 *
 * @param {Object} document - The HTML document object (real DOM or the mock
 *   built from the page HTML).
 * @returns {string} The trimmed description, or '' if the page has none.
 */
export default function getDescription(document) {
  // Candidates in priority order: getMeta returns the first one that has a
  // non-empty value. Open Graph wins because it is usually written for
  // sharing (human-readable), then the classic description, then Twitter's.
  // The last entries are non-standard variants seen on real pages
  // (og:description as `content`/`name`, `http-equiv`), plus `rel=search`.
  let description = getMeta(
    document,
    { type: 'property', id: 'og:description' },
    { type: 'name', id: 'description' },
    { type: 'name', id: 'twitter:description' },
    { type: 'content', id: 'og:description' },
    { type: 'name', id: 'og:description' },
    { type: 'rel', id: 'search' },
    { type: 'http-equiv', id: 'description' },
  );
  if (description.length === 0) return '';

  // trim() already strips "\n" along with other leading/trailing whitespace.
  return description[0].trim();
}
