import { load_data, store_data, delete_data } from '../lib/storage.js';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    if (!(await openInitialOptionsWindow())) {
      const activeTab = await browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
      let title = activeTab.title;
      let url = activeTab.url;

      let bookmarked = await checkBookmark(url);
      // on Network error bookmarked is undefined
      if (bookmarked.ok === false) bookmarked = undefined;
      // let bookmarked = [];
      // bookmarked['data'] = [];

      displayForm(bookmarked, title, url);

      let tags = await getTags();
      document.getElementById('tagInput').placeholder = '';

      const tagify = await addTagify(tags);

      if (bookmarked && bookmarked.data.length > 0 && bookmarked.data[0].tags) {
        tagify.addTags(bookmarked.data[0].tags);
      }

      const addButton = document.getElementById('add');
      addButton.addEventListener('click', async (event) => {
        event.preventDefault();
        addBookmark(tagify.value);
        window.close();
      });
    }
  }
};
// -----------------------------------------------------------------------------
async function addBookmark(tagsArray) {
  const title = document.getElementById('title').value;
  const url = document.getElementById('url').value;
  let tags = '';
  tagsArray.forEach((tag) => (tags += `&tags[]=${tag.value}`));
  const notes = document.getElementById('notes').value;

  // do not wait for a response, background.js should throw an error message
  // if the bookmarked cannot be saved TODO:
  browser.runtime.sendMessage({ msg: 'saveBookmark', data: { title, url, tags, notes } }).catch((error) => {
    console.log('error');
  });
}
// -----------------------------------------------------------------------------
function displayForm(bookmarked, title, url) {
  let template = `
  <body>
    <form>
      <label for="title">Title</label><input type="text" id="title" tabIndex="1">
      <label for="tagInput">Tags</label><input name="tagInput" placeholder="Loading tags..." disabled="true" id="tagInput" tabIndex="2" autofocus></p>
      <label for="notes">Notes</label>
      <textarea id="notes" tabIndex="3"></textarea>
      <button id="add" tabIndex="4">Add</button>
      <input type="hidden" id="url" name="url">
    </form>
  </body>`;

  // display message if url is already bookmarked
  if (typeof bookmarked != 'undefined' && bookmarked.data.length > 0) {
    template = '<div id="msg">URL already bookmarked!</div>' + template;
  }
  document.getElementById('popupForm').innerHTML = template;

  if (typeof bookmarked != 'undefined' && bookmarked.data.length > 0) {
    document.getElementById('add').innerText = 'Overwrite';
    document.getElementById('title').value = bookmarked.data[0].title;
    document.getElementById('url').value = bookmarked.data[0].url;
    // document.getElementById('notes').value = bookmarked.data[0]?.description;
    if (bookmarked.data[0].description != 'undefined') {
      document.getElementById('notes').value = bookmarked.data[0].description;
    }
  } else {
    document.getElementById('title').value = title;
    document.getElementById('url').value = url;
  }
}
// -----------------------------------------------------------------------------
async function openInitialOptionsWindow() {
  let appPassword = await load_data('credentials', 'appPassword');

  // If there are less than three items saved, display the initialOptions window
  if (appPassword === undefined) {
    // if option window already exists focus it
    let windowID = await load_data('credentials', 'windowID');
    const allWindows = await browser.windows.getAll();
    // Look for windowId in open windows
    const optionWindowFound = allWindows.some((win) => {
      return win.id === windowID;
    });
    if (optionWindowFound) {
      browser.windows.update(windowID, { focused: true });
      return new Promise((resolve) => resolve(true));
    }

    let dialogWidth = 300;
    let dialogHeight = 195;

    let win = await browser.windows.getCurrent();
    let optionWindow = await browser.windows.create({
      url: '../options/initial-options.html',
      width: dialogWidth,
      height: dialogHeight,
      left: Math.floor(win.width / 2 - dialogWidth / 2) + win.left,
      top: Math.floor(win.height / 2 - dialogHeight / 2) + win.top,
      type: 'popup',
    });
    windowID = optionWindow.id;

    // remove window tracer from DB if window is closed
    browser.windows.onRemoved.addListener((windowID) => {
      delete_data('credentials', 'windowID');
    });

    browser.windows.update(windowID, { focused: true });
    store_data('credentials', { windowID }); // store windows tracer in DB
    window.close();
    return new Promise((resolve) => resolve(true));
  }
  return new Promise((resolve) => resolve(false));
}
// -----------------------------------------------------------------------------
async function checkBookmark(url) {
  const bookmarked = await browser.runtime.sendMessage({
    msg: 'checkBookmark',
    data: url,
  });
  return bookmarked;
}
// ------------------------------------------------------------------------------
async function getTags() {
  const tags = await browser.runtime.sendMessage({ msg: 'getTags' });
  return tags;
}
// ------------------------------------------------------------------------------
async function addTagify(tags) {
  // const tags = await getTags();
  // const tags = ['tag1', 'tag2'];
  const tagsInput = document.getElementById('tagInput');
  const tagify = new Tagify(tagsInput, {
    whitelist: tags,
    backspace: 'edit',
    dropdown: {
      maxItems: 5,
      highlightFirst: true,
    },
  });
  return tagify;
}
// -----------------------------------------------------------------------------
