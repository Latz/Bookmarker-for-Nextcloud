// @ts-check
import { getOption } from '../../lib/storage.js';

/**
 * Wires the Save button of the popup form to the save handler below.
 * Must be called after createForm(), which creates the button's form.
 */
export default function addSaveBookmarkButtonListener() {
  document
    .getElementById('saveBookmark')
    .addEventListener('click', saveBookmark);
}

/**
 * @param {string} id
 * @returns {string} The element's value, or '' when the element is absent.
 */
function valueOf(id) {
  const element = /** @type {HTMLInputElement | null} */ (
    document.getElementById(id)
  );
  return element?.value ?? '';
}

/**
 * Click handler: reads the form, builds the API payload and hands it to the
 * service worker, which does the actual request (the popup closes right after,
 * which would abort a request made from here).
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function saveBookmark(event) {
  // Do not let the browser submit the form (that would reload the popup).
  event.preventDefault();

  try {
    // The form is read before anything is awaited: the popup can go away at any
    // await, and the values must not depend on it still being there.
    const url = valueOf('url');
    const title = valueOf('title');
    const bookmarkID = Number.parseInt(valueOf('bookmarkID'));
    const rawDescription = valueOf('description');
    const rawKeywords = valueOf('keywords');
    const selectedFolderIDs = Array.from(
      /** @type {HTMLSelectElement | null} */ (
        document.getElementById('folders')
      )?.options ?? [],
    )
      .filter((opt) => opt.selected)
      .map((opt) => opt.value);

    const { showDescription, showKeywords, displayFolders } =
      await loadDisplayOptions();

    // Tagify serialises its tags as a JSON array of {value: ...} objects into
    // the input's value. Broken JSON simply means "no keywords".
    let keywords = /** @type {Array<{value: string}>} */ ([]);
    try {
      if (showKeywords) keywords = JSON.parse(rawKeywords);
    } catch {
      keywords = [];
    }

    const folderIDs = displayFolders ? selectedFolderIDs : [];

    // Built with URLSearchParams rather than string concatenation. Previously
    // description, tag values and folder IDs were interpolated raw, so a value
    // containing "&" or "=" injected extra parameters into the API call -- a
    // tag named `x&folders[]=42` filed the bookmark into folder 42 regardless
    // of what the user selected. Only title and url were ever encoded.
    // zenMode.js already builds its payload this way.
    const params = new URLSearchParams();
    params.set('title', title);
    params.set('url', url);
    if (showDescription && rawDescription.length > 0) {
      params.set('description', rawDescription);
    }
    // The leading empty tags[] entry is preserved from the original payload:
    // the parameter has to be present for the API to clear existing tags.
    params.append('tags[]', '');
    for (const keyword of keywords) {
      params.append('tags[]', keyword.value);
    }
    // Without a folder selector the bookmark always goes to the root folder
    // (ID -1).
    if (displayFolders) {
      for (const id of folderIDs) params.append('folders[]', id);
    } else {
      params.append('folders[]', '-1');
    }
    params.set('page', '-1');

    // Awaited so the popup is not torn down before the message is on its way.
    await chrome.runtime.sendMessage({
      msg: 'saveBookmark',
      parameters: params.toString(),
      folderIDs,
      bookmarkID,
    });
  } catch (error) {
    console.error('[popup] saving the bookmark failed:', error);
  } finally {
    // Close in every case, including after an error: the popup has nothing
    // useful left to show, and the service worker reports the outcome.
    window.close();
  }
}

/**
 * Reads the three display options. After the 30 s options cache expires these
 * are real IndexedDB reads, so a failure must not lose the save: fall back to
 * what a fresh install uses, and file into the root folder.
 * @returns {Promise<{showDescription: boolean, showKeywords: boolean, displayFolders: boolean}>}
 */
async function loadDisplayOptions() {
  try {
    const [showDescription, showKeywords, displayFolders] = await Promise.all([
      getOption('cbx_showDescription'),
      getOption('cbx_showKeywords'),
      getOption('cbx_displayFolders'),
    ]);
    return { showDescription, showKeywords, displayFolders };
  } catch (error) {
    console.error('[popup] could not read options, using defaults:', error);
    return { showDescription: true, showKeywords: true, displayFolders: false };
  }
}
