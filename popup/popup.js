// https://www.cssscript.com/store-form-data-web-storage/

import { load_data, store_data, delete_data } from '../lib/storage.js';
import getMeta from './getMeta.js';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    if (!(await openInitialOptionsWindow())) {
      const activeTab = await browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
      let title = activeTab.title;
      let url = activeTab.url;

      // Display error if it's an internal page
      var protocol = new URL(url).protocol;
      if (['about:', 'chrome:'].includes(protocol)) {
        document.getElementById('popupForm').innerHTML = `
        <div id="errorWarningSign">⚠</div>
          <div id="errorHeader">Error</div>
          <div id="errorMessage">Can not bookmark "${protocol}" pages.</div>`;
        return;
      }

      const content = await browser.runtime.sendMessage({ msg: 'getContent' });
      let description = '';
      if (await load_data('options', 'cbx_autoDesc'))
        description = await getMeta(
          activeTab,
          content,
          { type: 'name', id: 'description' },
          { type: 'name', id: 'twitter:description' },
          { type: 'content', id: 'og:description' },
          { type: 'property', id: 'og:description' }
        );
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
        let keywords = await getKeywords(activeTab, content, tags);
        if (keywords.length > 0) tagify.addTags(keywords);
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
  let displayFolders = await load_data('options', 'cbx_displayFolders');
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
  let displayFolders = await load_data('options', 'cbx_displayFolders');
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

      let displayFolders = await load_data('options', 'cbx_displayFolders');
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
  if (!keywords) return [];

  keywords = keywords.flat().map((keyword) => (keyword = keyword.toLowerCase()).trim());

  let tags_array = [];
  for (let tag of tags) if (keywords.includes(tag.toLowerCase())) tags_array.push(tag);
  let unique_tags_array = new Map(tags_array.map((s) => [s.toLowerCase(), s]));
  return tags_array;
  return [...unique_tags_array.values()];
}

// -----------------------------------------------------------------------------
async function getKeywords(activeTab, content, tags) {
  let keywords = await getMeta(
    activeTab,
    content,
    { type: 'name', id: 'keywords' },
    { type: 'name', id: 'news_keywords' },
    { type: 'property', id: 'article:tag' }
  );
  // keywords = tagsKeywordIntersection(tags, keywords);
  if (keywords.length > 0) return keywords;
  const dom = new DOMParser().parseFromString(content, 'text/html');

  // -----
  // try <a href="" rel="tag">
  console.log('rels tags');
  let relsTag = dom.querySelectorAll('a[rel=tag]');
  relsTag.forEach((tag) => keywords.push(tag.text));
  keywords = tagsKeywordIntersection(tags, keywords);

  if (keywords.length > 0) return keywords;

  // -----
  // try <a href="" rel="category">
  let relsCategories = dom.querySelectorAll('a[rel=category]');
  relsCategories.forEach((category) => keywords.push(category.text));
  keywords = tagsKeywordIntersection(tags, keywords);

  if (keywords.length > 0) return keywords;

  // -----
  // try JSON-LD
  let jsonld = dom.querySelector('script[type="application/ld+json"]');
  if (jsonld) {
    jsonld = JSON.parse(jsonld.innerText);
    jsonld.keywords?.forEach((keyword) => {
      let [id, value] = keyword.split(':');
      if (id.toLowerCase() === 'tag') keywords.push(value);
    });
    keywords = tagsKeywordIntersection(tags, keywords);
    if (keywords.length > 0) return keywords;

    // try @graph -> @type: Article -> keywords
    if (jsonld['@graph'])
      jsonld['@graph'].forEach((graph) => {
        if (typeof graph['@type'] === 'string' && graph['@type'].toLowerCase() === 'article') {
          keywords = graph.keywords;
        }
      });
    keywords = tagsKeywordIntersection(tags, keywords);
    if (keywords.length > 0) return keywords;
  }

  // try description
  let description = await getMeta(
    activeTab,
    content,
    { type: 'name', id: 'description' },
    { type: 'name', id: 'twitter:description' },
    { type: 'content', id: 'og:description' }
  );
  // remove punctuation
  if (description) {
    description = description[0].replace(/[\p{P}$+<=>^`|~]/gu, '');
    keywords = tagsKeywordIntersection(tags, description?.split(' '));
    keywords = tagsKeywordIntersection(tags, keywords);
    if (keywords.length > 0) return keywords;
  }

  // extract headings down to <h3>
  let level = 1;
  while (level <= 2) {
    const dom = new DOMParser().parseFromString(content, 'text/html');
    let headings = Array.from(dom.querySelectorAll(`h${level}`)).map((h) => h.textContent);
    keywords = headings?.map((heading) => heading.split(' '));
    keywords = tagsKeywordIntersection(tags, keywords);

    if (keywords.length > 0) break;
    level++;
  }
  keywords = tagsKeywordIntersection(tags, keywords);
  console.log('keywords :>> ', keywords);

  return keywords;
}
