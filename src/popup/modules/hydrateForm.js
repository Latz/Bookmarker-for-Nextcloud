import fillKeywords from './fillKeywords.js';
import fillFolders from './fillFolders.js';
import { getOption } from '../../lib/storage.js';

function addTextInput(node, id, show) {
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.setAttribute('id', id);
  textInput.setAttribute(
    'class',
    'input input-bordered input-info input-sm w-full mb-2 p-1'
  );
  if (!show) {
    textInput.setAttribute('class', 'hidden');
  }
  node.appendChild(textInput);
}
// --------------------------------------------------------------------------------------------------
function addTextArea(node, id, show = true) {
  const textArea = document.createElement('textarea');
  textArea.setAttribute('id', id);
  textArea.setAttribute(
    'class',
    'textarea textarea-bordered textarea-info textarea-sm w-full mb-2 p-1 leading-4 h-20 p-1'
  );
  if (!show) {
    textArea.setAttribute('class', 'hidden');
  }
  node.appendChild(textArea);
}
// --------------------------------------------------------------------------------------------------
// The extra <div> is added because the yelect> element does not have a resize event

async function addDropdown(node, id) {
  // The user does not want to use folders, so we return
  if (!(await getOption('cbx_displayFolders'))) return;

  const container = document.createElement('div');
  container.setAttribute('id', `${id}-container`);
  const dropdown = document.createElement('select');
  dropdown.setAttribute('id', id);
  dropdown.setAttribute('placeholder', 'Loading folders...');
  dropdown.setAttribute('size', 5);
  dropdown.setAttribute('multiple', 'true');
  dropdown.setAttribute(
    'class',
    'select select-bordered select-info w-full border-solid border-2 border-sky-500 mb-2 p-1'
  );
  container.appendChild(dropdown);
  node.appendChild(container);
}
// --------------------------------------------------------------------------------------------------
function addHiddenInput(node, id) {
  const hiddenInput = document.createElement('input');
  hiddenInput.setAttribute('id', id);
  hiddenInput.setAttribute('type', 'hidden');
  node.appendChild(hiddenInput);
}
// ---------------------------------------------------------------------------------------------------
export async function createForm() {
  const form = document.getElementById('formData');
  const showUrl = await getOption('cbx_showUrl');
  addTextInput(form, 'url', showUrl);
  addTextInput(form, 'title', true);
  await addDropdown(form, 'folders');
  if (await getOption('cbx_showKeywords'))
    addTextInput(form, 'keywords', await getOption('cbx_showKeywords'));
  addTextArea(form, 'description', await getOption('cbx_showDescription'));

  if (await getOption('cbx_alreadyStored')) {
    document.getElementById('sub_message').innerHTML =
      '<div class="text-center">Checking Nextcloud...<span class="loader"></span></div>';
  }

  addHiddenInput(form, 'bookmarkID');
}

// ---------------------------------------------------------------------------------------------------
export async function hydrateForm(data) {
  document.getElementById('url').value = data.url;
  document.getElementById('title').value = data.title;
  if (
    (await getOption('cbx_showDescription')) &&
    (await getOption('cbx_autoDescription'))
  ) {
    document.getElementById('description').value = data.description;
  }
  document.getElementById('bookmarkID').value = data.bookmarkID;

  fillKeywords(data.keywords);
  fillFolders(document.getElementById('folders'), data.folders);
  const message = document.getElementById('sub_message');
  // If the the data object contains tags, it has been loaded from the server
  if (data.found) {
    const dateAdded = new Date(0);
    dateAdded.setUTCSeconds(data.added);
    message.innerHTML = `Already bookmarked! < br /> Created: ${dateAdded.toLocaleString(
      navigator.language
    )} `;
    if (data.added !== data.lastmodified) {
      const dateModified = new Date(0);
      dateModified.setUTCSeconds(data.lastmodified);
      message.innerHTML += `< br /> Modified: ${dateModified.toLocaleString(
        navigator.language
      )} `;
    }
  } else if (!data.checkBookmark.ok) {
    // display error
    message.innerHTML =
      '<div class="text-red-500 text-center font-bold">Error</div><div class="text-center">Connection error</div>';
  } else {
    message.innerHTML = '';
  }
}
