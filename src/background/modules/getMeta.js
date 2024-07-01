import log from '../../lib/log.js';
/**
+ * Returns an array containing the values of specified meta tags in the given document, 
+ * based on the passed meta tag names.
+ *
+ * @param {Object} document - The HTML document object.
+ * @param {...Object} metaNames - The meta tag names to get values for. 
+ * @return {Array} An array containing the values of specified meta tags.
+ */

const DEBUG = true;

export default function getMeta(document, ...metaNames) {
  log(DEBUG, 'GetMeta');
  const metas = [];
  for (const { type, id } of metaNames) {
    log(DEBUG, type, id);
    const metaNodelist = document.querySelectorAll(`[${type}="${id}" i]`);

    if (metaNodelist.length > 0) {
      for (const meta of metaNodelist) {
        const { content } = meta;
        if (content !== '' && content !== undefined) {
          metas.push(content);
        }
      }
      log(DEBUG, 'metas', metas);
      if (metas.length > 0) {
        return metas;
      }
    }
  }
  return [];
}
