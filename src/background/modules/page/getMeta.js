import log from '../../../lib/log.js';

const DEBUG = false;

/**
 * Returns the `content` values of the first group of meta-like elements that
 * yields any non-empty value.
 *
 * The candidates are tried in the order given, so callers list them by
 * priority (e.g. `og:description` before `description`). Matching is
 * case-insensitive (the ` i` flag in the attribute selector), because real
 * pages write `Description`, `OG:Title` and so on.
 *
 * @param {Object} document - The HTML document object.
 * @param {...{type: string, id: string}} metaNames - Candidates in priority
 *   order: `type` is the attribute name to look at (`name`, `property`, ...),
 *   `id` the value it must have.
 * @return {string[]} The values of the first candidate that matched, or an
 *   empty array if none did.
 */
export default function getMeta(document, ...metaNames) {
  log(DEBUG, 'GetMeta');

  for (const { type, id } of metaNames) {
    log(DEBUG, type, id);
    const metaNodelist = document.querySelectorAll(`[${type}="${id}" i]`);

    // OPTIMIZATION 1: Early continue if no matches (skip processing)
    if (metaNodelist.length === 0) continue;

    // OPTIMIZATION 2: Collect valid content values
    const metas = [];
    for (const meta of metaNodelist) {
      const { content } = meta;
      // OPTIMIZATION 3: Keep only non-empty strings. A meta tag without a content
      // attribute arrives as null, and every consumer calls string methods
      // (trim, replaceAll) on the values -- null would throw and take the
      // whole extraction down with it.
      if (typeof content === 'string' && content !== '') {
        metas.push(content);
      }
    }

    // OPTIMIZATION 4: Early return on first match (avoid checking remaining metaNames)
    if (metas.length > 0) {
      log(DEBUG, 'metas', metas);
      return metas;
    }
  }

  return [];
}
