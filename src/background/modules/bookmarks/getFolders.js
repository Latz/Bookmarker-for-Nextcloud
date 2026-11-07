// @ts-check
import { getOption } from '../../../lib/storage.js';
import { cacheGet } from '../../../lib/cache.js';
import log from '../../../lib/log.js';

const DEBUG = false;

/**
 * Returns the user's Nextcloud folders as flat option descriptors.
 *
 * cacheGet does the work: cache first (folders change rarely, entries live
 * 24h), otherwise the server, whose result it renders and writes back.
 *
 * @param {boolean} [force] - Fetch even if the user turned folder display off
 *   (used by the options page to let the user pick their zen-mode folders).
 * @returns {Promise<Array<{value: string, name: string}>>} Options led by
 *   Root, or [] when folders are disabled or could not be loaded.
 */
export async function getFolders(force = false) {
  if (!(await getOption('cbx_displayFolders')) && !force) return [];

  const folders = await cacheGet('folders');
  log(DEBUG, 'folders', folders);
  return Array.isArray(folders) ? folders : [];
}

// ---------------------------------------------------------------------------------------------------
/**
 * Flattens a folder tree into option descriptors, indenting nested folders and
 * sorting each level alphabetically.
 *
 * Returns data, not markup. It used to build an <option> string that consumers
 * assigned to innerHTML, with folder titles interpolated unescaped -- so a
 * server-supplied (or shared) folder title could inject arbitrary HTML into the
 * popup and options pages, and the payload persisted in the 24h folder cache.
 *
 * @param {Array<{id: string, title: string, children?: Array}>} folders - Folder tree from the server.
 * @returns {Array<{value: string, name: string}>} Flat list, always led by Root.
 */
export function preRenderFolders(folders) {
  const userLang = navigator.language || navigator.userLanguage;
  // Root has the fixed ID -1 in the Bookmarks API and is not part of the
  // server's folder tree, so it is added by hand as the first entry.
  const folderStructure = [{ name: 'Root', value: '-1' }]; // root folder
  // One collator for the whole tree. `localeCompare` allocates a collator per
  // comparison, and the previous `> 0` comparator returned a boolean — which
  // coerces to 1/0 and so could never express "a sorts before b".
  const collator = new Intl.Collator(userLang);

  // recursively create folder structure (depth-first, so children directly
  // follow their parent). `x` is the indent prefix: two figure spaces
  // (U+2007) per level -- unlike normal spaces they are not collapsed by
  // <option> rendering, so the hierarchy stays visible in the dropdown.
  /**
   * Appends one level of the tree to `folderStructure`, then recurses.
   * @param {Array<{id: string, title: string, children?: Array}>|undefined} folders - Nodes of this level (sorted in place).
   * @param {string} [x] - Indent prefix for this level.
   */
  function json2tree(folders, x = '') {
    if (folders !== undefined) {
      folders.sort((a, b) => collator.compare(a.title, b.title));
      for (let f of folders) {
        folderStructure.push({ name: `${x}${f.title}`, value: f.id });
        if (f.children) json2tree(f.children, `${x}\u2007\u2007`);
      }
    }
  }
  json2tree(folders);

  return folderStructure;
}
