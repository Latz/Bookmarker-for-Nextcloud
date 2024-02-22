import { getOption } from '../../lib/storage.js';
import apiCall from '../../lib/apiCall.js';
import { cacheGet, cacheAdd } from '../../lib/cache.js';
import log from '../../lib/log.js';

const DEBUG = false;

export async function getFolders() {
  // User does not use folders, so we returns
  if (!(await getOption('cbx_displayFolders'))) return '';

  let folders = await cacheGet('folders');
  if (typeof folders === 'undefined' || folders.length === 0) {
    const serverFolders = await apiCall(
      'index.php/apps/bookmarks/public/rest/v2/folder',
      'GET'
    );
    folders = preRenderFolders(serverFolders.data);
    cacheAdd('folders', folders);
  }
  log(DEBUG, 'folders', folders);
  return Promise.resolve(folders);
}

// ---------------------------------------------------------------------------------------------------
export function preRenderFolders(folders) {
  let userLang = navigator.language || navigator.userLanguage;
  let folderStructure = [{ name: 'Root', value: '-1' }]; // root folder

  // recursively create folder structure
  function json2tree(folders, x = '') {
    folders.sort((a, b) => a.title.localeCompare(b.title, userLang) > 0);
    for (let f of folders) {
      folderStructure.push({ name: `${x}${f.title}`, value: f.id });
      if (f.children) json2tree(f.children, `${x}\u2007\u2007`);
    }
  }
  json2tree(folders);

  // convert JSOn to prerendered HTML
  let selectElement = '';
  folderStructure.forEach((folder) => {
    selectElement += `<option value="${folder.value}">${folder.name}</option>`;
  });
  return selectElement;
}
