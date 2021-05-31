// https://www.cssscript.com/store-form-data-web-storage/

import { load_data, store_data, delete_data } from '../lib/storage.js';
import getMeta from './getMeta.js';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    if (!(await openInitialOptionsWindow())) {
      const activeTab = await browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
      let title = activeTab.title;
      let url = activeTab.url;

      const content = await browser.runtime.sendMessage({ msg: 'getContent' });
      let description = '';
      // <meta name="twitter:description"
      // https://www.mindsdelight.de/2021/05/ein-historiker-folgt-hinweisen-auf-3-fotos-von-new-york-um-das-exakte-datum-der-aufnahmen-zu-ermitteln/
      // <meta property="og:description" content="
      // https://www.hanselman.com/blog/running-microsoft-edge-on-linux-with-wslg-while-running-visual-studio-2019-and-debugging-a-linux-net-app-with-wsl-on-windows-10
      if (await load_data('options', 'cbx_autoDesc'))
        description = await getMeta(activeTab, content, 'description', 'twitter:description');

      console.log('description', description);
      description = description ? description : '';

      // let bookmarked = await checkBookmark(url);
      // // on Network error bookmarked is undefined
      // if (bookmarked.ok === false) bookmarked = undefined;
      let bookmarked = [];
      bookmarked['data'] = [];

      await displayForm(bookmarked, title, url, description);
      document.getElementById('tagInput').placeholder = '';

      // use keywords as preselected tags
      let tags = await getTags();

      const tagify = await addTagify(tags);
      if (bookmarked && bookmarked.data.length > 0 && bookmarked.data[0].tags) {
        console.log('bookmarked');
        tagify.addTags(bookmarked.data[0].tags);
      } else if (await load_data('options', 'cbx_autoTags')) {
        tagify.addTags(await getKeywords(activeTab, content, tags));
      }

      const addButton = document.getElementById('add');
      addButton.addEventListener('click', async (event) => {
        event.preventDefault();
        addBookmark(tagify.value);
      });
    }
  }
};
// -----------------------------------------------------------------------------
async function addBookmark(tagsArray) {
  const title = document.getElementById('title').value;
  const url = document.getElementById('url').value;
  let tags = JSON.stringify(tagsArray);
  const notes = document.getElementById('notes').value;

  let folders = [];
  let displayFolders = await load_data('options', 'displayFolders');
  if (displayFolders) {
    for (let folder of folderSelect.options) if (folder.selected) folders.push(folder.value);
  }
  //store last selected folders
  // TODO: move to background.js to avoid await
  await store_data('options', { last_used_folders: folders });
  // do not wait for a response, background.js should throw an error message
  // if the bookmarked cannot be saved TODO:
  browser.runtime
    .sendMessage({ msg: 'saveBookmark', data: { title, url, tags, notes, folders: folders.toString() } })
    .catch((error) => {
      console.log('error');
    });
  window.close();
}
// -----------------------------------------------------------------------------
async function displayFolders() {
  let displayFolders = await load_data('options', 'displayFolders');
  if (!displayFolders) return '';
  return `<label for="folderSelect">
            Folders
          </label>
          <select name="folderSelect" placeholder="Loading folders..." disabled="true" id="folderSelect" tabIndex="2" size="5" multiple ></select>
          </p>
  `;
}
// -----------------------------------------------------------------------------
async function addFolders() {
  // asynchronously load folders
  const folders = browser.runtime
    .sendMessage({
      msg: 'loadFolders',
    })
    .then(async (folders) => {
      let userLang = navigator.language || navigator.userLanguage;
      var folderStructure = [{ name: 'Root', value: '-1' }]; // root folder

      function json2tree(folders, x = '') {
        folders.sort((a, b) => a.title.localeCompare(b.title, userLang) > 0);
        for (let f of folders) {
          folderStructure.push({ name: `${x}${f.title}`, value: f.id });
          if (f.children) json2tree(f.children, `${x}\u2007\u2007`);
        }
      }
      json2tree(folders);

      let displayFolders = await load_data('options', 'displayFolders');
      if (displayFolders) {
        let folderSelect = document.getElementById('folderSelect');
        folderStructure.forEach(async (folder) => {
          let option = document.createElement('option');
          option.text = folder.name;
          option.value = folder.value;
          folderSelect.add(option);
        });
        let last_used_folders = await load_data('options', 'last_used_folders');
        if (typeof last_used_folders !== 'undefined') {
          folderSelect.value = null; //deselect all options
          for (let option of folderSelect) option.selected = last_used_folders.includes(option.value);
        } else {
          // set root as default selected folder
          folderSelect.options[0].selected = true;
        }
        folderSelect.disabled = false;
      }
    });
}
// ------------------------------------------------------------------------------
async function displayForm(bookmarked, title, url, description) {
  let template = `
  <body>
    <form>
      <span><label for="title">Title</label><input type="text" id="title" tabIndex="1">
      <span id="recentBookarms">▼</span></span>
      <label for="tagInput">Tags</label><input class="customlook" name="tagInput" placeholder="Loading tags..." disabled="true" id="tagInput" tabIndex="2" autofocus></p>
      ${await displayFolders()}
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
    document.getElementById('notes').value = description;
  }
  addFolders();
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
function tagsKeywordIntersection(tags, keywords) {
  // only insert tags if there aren't already any tag
  if (!keywords) return;

  keywords = keywords.flat().map((keyword) => (keyword = keyword.toLowerCase()));

  let tags_array = [];
  for (let tag of tags) if (keywords.includes(tag.toLowerCase())) tags_array.push(tag);
  let unique_tags_array = new Map(tags_array.map((s) => [s.toLowerCase(), s]));

  return [...unique_tags_array.values()];
}

// -----------------------------------------------------------------------------
async function getKeywords(activeTab, content, tags) {
  console.log('*** keywords');

  // try <meta name="keywords"> tag

  // TODO: doppelte tags rauswerfen: https://github.com/aleksey-hoffman/sigma-file-manager

  let keywords = await getMeta(activeTab, content, 'keywords');
  keywords = tagsKeywordIntersection(tags, keywords?.split(','));
  if (keywords) return keywords;

  // try description
  let description = await getMeta(activeTab, content, 'description');
  // remove punctuation
  if (description) {
    description = description.replace(/[\p{P}$+<=>^`|~]/gu, '');
    keywords = tagsKeywordIntersection(tags, description?.split(' '));
    if (keywords.length > 0) return keywords;
  }
  // extract headings down to <h3>
  let level = 1;
  while (level <= 3) {
    const dom = new DOMParser().parseFromString(content, 'text/html');
    let headings = Array.from(dom.querySelectorAll(`h${level}`)).map((h) => h.textContent);
    console.log('headings :>> ', headings);
    keywords = headings?.map((heading) => heading.split(' '));
    keywords = tagsKeywordIntersection(tags, keywords);

    if (keywords.length > 0) break;
    level++;
  }

  console.log('keywords :>> ', keywords);

  return keywords;
}
