// @ts-check
// Builds the popup's bookmark form (createForm) and fills it with the data
// received from the service worker (hydrateForm). The two steps are separate
// so the form can be built while the data request is still in flight.
import fillKeywords from './fillKeywords.js';
import fillFolders from './fillFolders.js';
import { getOptions } from '../../lib/storage.js';

/**
 * Appends a single-line text input to `node`.
 * @param {HTMLElement} node - Parent element.
 * @param {string} id - Element id (also how the other modules find it).
 * @param {boolean} show - If false the input is created but hidden, so code
 *   that reads it by id keeps working.
 */
function addTextInput(node, id, show) {
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.setAttribute('id', id);
  textInput.setAttribute(
    'class',
    'input input-bordered input-info input-sm w-full mb-2 p-1',
  );
  if (!show) {
    textInput.setAttribute('class', 'hidden');
  }
  node.appendChild(textInput);
}
// --------------------------------------------------------------------------------------------------
/**
 * Appends a multi-line text area to `node`.
 * @param {HTMLElement} node - Parent element.
 * @param {string} id - Element id.
 * @param {boolean} [show] - If false the element is created but hidden.
 */
function addTextArea(node, id, show = true) {
  const textArea = document.createElement('textarea');
  textArea.setAttribute('id', id);
  textArea.setAttribute(
    'class',
    'textarea textarea-bordered textarea-info textarea-sm w-full mb-2 p-1 leading-4 h-20 p-1',
  );
  if (!show) {
    textArea.setAttribute('class', 'hidden');
  }
  node.appendChild(textArea);
}
// --------------------------------------------------------------------------------------------------
// The extra <div> is added because the yelect> element does not have a resize event

/**
 * Appends the (multi-select) folder list, wrapped in a container div. It is
 * only created when the user enabled folders; fillFolders fills it later.
 * @param {HTMLElement} node - Parent element.
 * @param {string} id - Id of the <select>; the wrapper gets `${id}-container`.
 * @param {boolean} displayFolders - The cbx_displayFolders option.
 */
function addDropdown(node, id, displayFolders) {
  // The user does not want to use folders, so we return
  if (!displayFolders) return;

  const container = document.createElement('div');
  container.setAttribute('id', `${id}-container`);
  const dropdown = document.createElement('select');
  dropdown.setAttribute('id', id);
  dropdown.setAttribute('placeholder', 'Loading folders...');
  dropdown.setAttribute('size', 5);
  dropdown.setAttribute('multiple', 'true');
  dropdown.setAttribute(
    'class',
    'select select-bordered select-info w-full border-solid border-2 border-sky-500 mb-2 p-1',
  );
  container.appendChild(dropdown);
  node.appendChild(container);
}
// --------------------------------------------------------------------------------------------------
/**
 * Appends a hidden input, used to carry the ID of an already existing
 * bookmark from hydrateForm to the save handler.
 * @param {HTMLElement} node - Parent element.
 * @param {string} id - Element id.
 */
function addHiddenInput(node, id) {
  const hiddenInput = document.createElement('input');
  hiddenInput.setAttribute('id', id);
  hiddenInput.setAttribute('type', 'hidden');
  node.appendChild(hiddenInput);
}
// ---------------------------------------------------------------------------------------------------
/**
 * Creates the form fields the user's options ask for. The fields are empty;
 * hydrateForm fills them once the page data has arrived.
 * @returns {Promise<void>}
 */
export async function createForm() {
  const form = document.getElementById('formData');

  // Batch fetch all options in one DB call
  const options = await getOptions([
    'cbx_showUrl',
    'cbx_displayFolders',
    'cbx_showKeywords',
    'cbx_showDescription',
    'cbx_alreadyStored',
  ]);

  addTextInput(form, 'url', options.cbx_showUrl);
  addTextInput(form, 'title', true);
  addDropdown(form, 'folders', options.cbx_displayFolders);

  if (options.cbx_showKeywords)
    addTextInput(form, 'keywords', options.cbx_showKeywords);
  addTextArea(form, 'description', options.cbx_showDescription);

  // The "already bookmarked?" check runs on the server side of getData; show
  // a spinner until hydrateForm replaces it with the result.
  if (options.cbx_alreadyStored) {
    const checkingDiv = document.createElement('div');
    checkingDiv.className = 'text-center';
    const loaderSpan = document.createElement('span');
    loaderSpan.className = 'loader';
    checkingDiv.append(
      `${chrome.i18n.getMessage('Checking')} Nextcloud...`,
      loaderSpan,
    );
    document.getElementById('sub_message').replaceChildren(checkingDiv);
  }

  addHiddenInput(form, 'bookmarkID');
  document.getElementById('saveBookmark').textContent =
    chrome.i18n.getMessage('saveBookmark');
}

// ---------------------------------------------------------------------------------------------------
/**
 * Fills the form with the result of the service worker's getData call, and
 * shows whether the page is already bookmarked.
 * @param {Object} data - The successful getData reply (url, title,
 *   description, keywords, folders, bookmarkID, found/added/lastmodified,
 *   checkBookmark).
 * @returns {Promise<void>}
 */
export async function hydrateForm(data) {
  document.getElementById('url').value = data.url;
  document.getElementById('title').value = data.title;

  // Batch fetch options in one DB call
  const options = await getOptions([
    'cbx_showDescription',
    'cbx_autoDescription',
  ]);

  // Prefill the description only if it is shown and the user wants it
  // prefilled from the page.
  if (options.cbx_showDescription && options.cbx_autoDescription) {
    document.getElementById('description').value = data.description;
  }
  document.getElementById('bookmarkID').value = data.bookmarkID;

  // Both are async and independent: start them together, render the status
  // message meanwhile, and await them at the end so a failure reaches the
  // caller instead of becoming an unhandled rejection.
  const filling = Promise.all([
    fillKeywords(data.keywords),
    fillFolders(document.getElementById('folders'), data.folders),
  ]);
  // Observed by the await below; this only covers an early throw in between.
  filling.catch(() => {});
  const message = document.getElementById('sub_message');
  // If the the data object contains tags, it has been loaded from the server
  if (data.found) {
    // The server sends Unix timestamps in seconds: start at the epoch and add
    // the seconds, then format in the user's locale.
    const dateAdded = new Date(0);
    dateAdded.setUTCSeconds(data.added);
    message.replaceChildren(
      `${chrome.i18n.getMessage('alreadyBookmarked')}!`,
      document.createElement('br'),
      `${chrome.i18n.getMessage('Created')}: ${dateAdded.toLocaleString(navigator.language)}`,
    );
    // Only mention a modification date if the bookmark was edited after creation.
    if (data.added !== data.lastmodified) {
      const dateModified = new Date(0);
      dateModified.setUTCSeconds(data.lastmodified);
      message.append(
        document.createElement('br'),
        ` ${chrome.i18n.getMessage('Modified')}: ${dateModified.toLocaleString(navigator.language)} `,
      );
    }
  } else if (!data.checkBookmark.ok) {
    // Not found, and the lookup itself failed: the server is unreachable, so
    // say so instead of implying the page is new.
    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-red-500 text-center font-bold';
    errorDiv.textContent = 'Error';
    const connDiv = document.createElement('div');
    connDiv.className = 'text-center';
    connDiv.textContent = chrome.i18n.getMessage('ConnectionError');
    message.replaceChildren(errorDiv, connDiv);
  } else {
    message.replaceChildren();
  }

  await filling;
}
