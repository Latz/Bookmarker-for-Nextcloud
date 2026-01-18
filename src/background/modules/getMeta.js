import log from '../../lib/log.js';
/**
+ * Returns an array containing the values of specified meta tags in the given document, 
+ * based on the passed meta tag names.
+ *
+ * @param {Object} document - The HTML document object.
+ * @param {...Object} metaNames - The meta tag names to get values for. 
+ * @return {Array} An array containing the values of specified meta tags.
+ */

const DEBUG = false;

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
      // OPTIMIZATION 3: Filter out only empty string and undefined (keep null for backward compatibility)
      if (content !== '' && content !== undefined) {
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
