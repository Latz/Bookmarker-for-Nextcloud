import { getOption } from '../../lib/storage.js';

/**
 * Fill the selectbox with the given folders and select the options based on the folder IDs.
 *
 * @param {HTMLElement} selectbox - The selectbox element to be filled with options.
 * @param {string} folders - The HTML string representing the options to be added to the selectbox.
 * @return {Promise<void>} A promise that resolves once the selectbox is filled and options are selected.
 */
export default async function fillFolders(selectbox, folders) {
  if (!folders) {
    return;
  }

  selectbox.innerHTML = folders;

  const folderIDs = await getOption('folderIDs');

  if (folderIDs) {
    if (Array.isArray(folderIDs)) {
      Array.from(selectbox.options).forEach((option) => {
        option.selected = folderIDs.includes(option.value);
      });
    } else {
      selectbox.options.selected = folderIDs;
    }
  }
}
