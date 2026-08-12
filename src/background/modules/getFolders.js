// @ts-check
import { getOption } from '../../lib/storage.js';
import apiCall from '../../lib/apiCall.js';
import { cacheGet, cacheAdd } from '../../lib/cache.js';
import log from '../../lib/log.js';

const DEBUG = false;

export async function getFolders(force = false) {
  // User does not use folders, so we returns
  // Empty list, not '' -- the return type is a descriptor array now.
  if (!(await getOption('cbx_displayFolders')) && !force) return [];

  let folders = await cacheGet('folders');
  // Array check also rejects the pre-0.33 HTML-string cache format, in case a
  // stale entry reaches this far.
  if (!Array.isArray(folders) || folders.length === 0) {
    const serverFolders = await apiCall(
      'index.php/apps/bookmarks/public/rest/v2/folder',
      'GET',
    );
    folders = preRenderFolders(serverFolders.data);
    cacheAdd('folders', folders);
  }
  log(DEBUG, 'folders', folders);
  return folders;
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
  const folderStructure = [{ name: 'Root', value: '-1' }]; // root folder
  // One collator for the whole tree. `localeCompare` allocates a collator per
  // comparison, and the previous `> 0` comparator returned a boolean — which
  // coerces to 1/0 and so could never express "a sorts before b".
  const collator = new Intl.Collator(userLang);

  // recursively create folder structure
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
