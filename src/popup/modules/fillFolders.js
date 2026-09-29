// @ts-check
import { getOption } from '../../lib/storage.js';

/**
 * Builds <option> elements for a folder list.
 *
 * Titles are assigned with textContent, never parsed as markup, so a hostile
 * folder name from the server is rendered literally.
 *
 * @param {Array<{value: string, name: string}>} folders - Option descriptors.
 * @returns {DocumentFragment} Fragment of option elements, ready to append.
 */
export function buildFolderOptions(folders) {
  const fragment = document.createDocumentFragment();
  for (const { value, name } of folders) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = name;
    fragment.appendChild(option);
  }
  return fragment;
}

/**
 * Fill the selectbox with the given folders and select the options based on the folder IDs.
 *
 * Builds option elements and sets their text via textContent, so a folder title
 * is always treated as text. The previous version assigned a server-built HTML
 * string to innerHTML, which allowed markup in a folder title to reach the DOM.
 *
 * @param {HTMLElement} selectbox - The selectbox element to be filled with options.
 * @param {Array<{value: string, name: string}>} folders - Option descriptors from preRenderFolders.
 * @return {Promise<void>} A promise that resolves once the selectbox is filled and options are selected.
 */
export default async function fillFolders(selectbox, folders) {
  // Nothing to show (folders disabled, or the server call failed): leave the
  // selectbox untouched.
  if (!folders || folders.length === 0) {
    return;
  }

  // One append of a prebuilt fragment means a single DOM reflow, however many
  // folders there are.
  selectbox.appendChild(buildFolderOptions(folders));

  // The folders the user picked for their last saved bookmark (stored by
  // saveBookmark) are pre-selected, so repeated saves into the same folder
  // need no clicks.
  const folderIDs = await getOption('folderIDs');

  if (folderIDs) {
    // Normal case: the select is a multi-select, so an array of IDs is stored.
    if (Array.isArray(folderIDs)) {
      Array.from(selectbox.options).forEach((option) => {
        option.selected = folderIDs.includes(option.value);
      });
    } else if (typeof folderIDs === 'string' || typeof folderIDs === 'number') {
      // A single stored ID: select the matching option. (The previous version
      // assigned to selectbox.options.selected, which selects nothing.)
      const id = String(folderIDs);
      for (const option of selectbox.options) {
        option.selected = option.value === id;
      }
    }
  }
}
