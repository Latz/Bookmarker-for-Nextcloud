// @ts-check
// https://developer.chrome.com/docs/extensions/mv3/options/
import {
  load_data_all,
  load_data,
  store_data,
  initDefaults,
  clearData,
  createOldDatabase,
} from '../lib/storage.js';
import Tagify from '@yaireo/tagify';
import '@yaireo/tagify/dist/tagify.css';
import { getFolders } from '../background/modules/bookmarks/getFolders.js';
import { buildFolderOptions } from '../popup/modules/fillFolders.js';

import {
  clampTimeoutSetting,
  DEFAULT_TIMEOUT_SECONDS,
} from '../lib/networkTimeout.js';

const OPTION_STORE = 'options';
// `vite build --mode development` keeps the developer tools; production hides them.
const IS_DEV_BUILD =
  import.meta.env?.DEV || import.meta.env?.MODE === 'development';
let tagify;

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    document.querySelectorAll('[i18n-data]').forEach((element) => {
      element.innerText = chrome.i18n.getMessage(
        element.getAttribute('i18n-data'),
      );
    });

    // set stored tab to active
    let activeTab = document.getElementById('tab_basic');
    const activeTabId = await load_data(OPTION_STORE, 'activeTab');
    if (activeTabId !== undefined) {
      // deselect basic tab select the stored tab
      activeTab = document.getElementById(activeTabId);
      document.getElementById('tab_basic').classList.remove('tab-active');
      document.getElementById(activeTabId).classList.add('tab-active');
    }

    setOptions();

    const tabs = document.getElementById('tabs');
    activeTab.classList.add('tab-active');
    const activeContent = document.getElementById(`content_${activeTab.id}`);
    activeContent.classList.remove('hidden');
    tabs.addEventListener('click', (event) => {
      if (activeTab === event.target) return;
      event.target.classList.add('tab-active');
      activeTab.classList.remove('tab-active');
      changeContent(activeTab, event.target);
      activeTab = event.target;
      store_data(OPTION_STORE, { activeTab: activeTab.id });
    });

    // --- zen keywords ----------------------------------------------------------------
    const tagsInput = document.getElementById('input_zenKeywords');
    const zenKeywords =
      (await load_data(OPTION_STORE, 'input_zenKeywords')) ?? [];
    tagify = new Tagify(tagsInput, {
      backspace: 'edit',
      whitelist: zenKeywords,
      dropdown: {
        maxItems: 5,
        highlightFirst: true,
        includeSelectedTags: true,
      },
    });
    // keep already-added tags matchable in the dropdown even if they weren't
    // in the initial whitelist
    tagify.on('add', ({ detail }) => {
      if (!tagify.whitelist.includes(detail.data.value)) {
        tagify.whitelist.push(detail.data.value);
      }
    });
    //--- fill zen tags
    // Everything local comes first and the listeners are attached before the
    // server round trip below: when that failed (offline, auth error), the code
    // after it never ran and zen keywords/folders silently stopped saving.
    if (zenKeywords.length > 0) {
      tagify.addTags(zenKeywords);
    }
    // registered after addTags so loading the stored tags does not re-save them
    tagify.on('add', saveZenTags);
    tagify.on('remove', saveZenTags);

    // --- zen folders ---------------------------------------------------------------------
    const input_zenFolders = document.getElementById('zen_folders');

    // store selected folder to database if selection changes
    input_zenFolders.addEventListener('change', () => {
      const selected = Array.from(input_zenFolders.options)
        .filter((f) => f.selected)
        .map((f) => f.value);
      store_data(OPTION_STORE, { zenFolderIDs: selected });
    });

    try {
      // fill zen folders selection box
      const folders = await getFolders(true);
      // Built as elements rather than assigned as an HTML string: folder titles
      // come from the server and were previously interpolated unescaped.
      input_zenFolders.appendChild(buildFolderOptions(folders));

      // load previously selected folders from database
      let zenFolderIDs = await load_data(OPTION_STORE, 'zenFolderIDs');
      // select previously selected folders
      if (zenFolderIDs === undefined) zenFolderIDs = ['-1'];
      for (const option of input_zenFolders.options) {
        if (zenFolderIDs.includes(option.value)) {
          option.selected = true;
        }
      }
    } catch (error) {
      console.error('[options] could not load the folder list:', error);
    }
  }
};

function saveZenTags() {
  const tags = tagify.value.map((tag) => tag.value);
  store_data(OPTION_STORE, { input_zenKeywords: tags });
}

//
// set slider if the user clicks on a heading number
document
  .getElementById('heading_selectors')
  .addEventListener('click', (event) => {
    // if target.id is "headings_selector" the user clicked no number
    if (event.target.id === 'heading_selectors') return;
    const previousValue = document.getElementById(
      'input_headings_slider',
    ).value;
    // ?. throughout: these ids come from the DOM, and a click before the stored
    // options are applied would otherwise throw on a missing element.
    document
      .getElementById(`${previousValue}`)
      ?.classList.remove('selected_heading');
    document.getElementById('input_headings_slider').value = event.target.id;
    document
      .getElementById(`${event.target.id}`)
      ?.classList.add('selected_heading');
    store_data(OPTION_STORE, {
      input_headings_slider: Number.parseInt(slider.value),
    });
  });

// color numbers id sets slider
// save value to database
const slider = document.getElementById('input_headings_slider');
slider.addEventListener('input', () => {
  // 'data' is only set once setOptions() has applied the stored value, so it can
  // still be null when the slider is moved very early.
  const previous_value = slider.getAttribute('data');
  document
    .getElementById(`${previous_value}`)
    ?.classList.remove('selected_heading');
  document.getElementById(`${slider.value}`)?.classList.add('selected_heading');
  slider.setAttribute('data', slider.value);
  store_data(OPTION_STORE, {
    input_headings_slider: Number.parseInt(slider.value),
  });
});

/**
 * Changes the content of the active tab to the target tab.
 *
 * @param {object} activeTab - The active tab object.
 * @param {object} target - The target tab object.
 */
function changeContent(activeTab, target) {
  const activeContent = document.getElementById(`content_${activeTab.id}`);
  const targetContent = document.getElementById(`content_${target.id}`);
  activeContent.classList.add('hidden');
  targetContent.classList.remove('hidden');
}

/**
 * Sets the options for the user interface.
 *
 * @return {Promise<void>} A Promise that resolves when the options are set.
 */
async function setOptions() {
  const options = document.getElementById('content');
  const optionsData = await load_data_all(OPTION_STORE);

  // set all defaults
  optionsData.forEach((option) => {
    if (option.item.startsWith('cbx')) {
      let option_element = document.getElementById(option.item);
      if (option_element) option_element.checked = option.value;
    }
    if (option.item.startsWith('input')) {
      let option_element = document.getElementById(option.item);
      if (option_element) option_element.value = option.value;
    }
    // set attribute to slider element, so that we can retrieve the previous
    // value to deselect the selected heading number when the you move the slider
    if (option.item === 'input_headings_slider') {
      document
        .getElementById('input_headings_slider')
        .setAttribute('data', option.value);
      document
        .getElementById(`${option.value}`)
        ?.classList.add('selected_heading');
    }
  });

  // --- set event listeners

  // --- set listner for changes on input_networkTimeout
  const input_networkTimeout = document.getElementById('input_networkTimeout');
  input_networkTimeout.addEventListener('input', () => {
    // An empty or half-typed field is skipped, not stored as NaN; a negative
    // value would make every request abort at once.
    const seconds = clampTimeoutSetting(input_networkTimeout.value);
    if (seconds !== null) {
      store_data(OPTION_STORE, { input_networkTimeout: seconds });
    }
  });
  // Show the value that is actually in effect once the user leaves the field
  input_networkTimeout.addEventListener('change', () => {
    input_networkTimeout.value = String(
      clampTimeoutSetting(input_networkTimeout.value) ??
        DEFAULT_TIMEOUT_SECONDS,
    );
  });

  if (!IS_DEV_BUILD) {
    // "Create old database" deletes the real database and installs fake
    // credentials; it exists for development only.
    document.getElementById('input_dbVersion')?.parentElement?.classList.add(
      'hidden',
    );
  }

  options.addEventListener('click', async (event) => {
    if (event.target.type === 'checkbox') {
      const { id, checked } = event.target;

      store_data(OPTION_STORE, { [id]: checked });
    }
    if (event.target.type === 'submit') {
      const button = event.target;
      // These wipe the user's settings or login, so ask first. The button's own
      // label is the question ("Clear all data?"): no new translations needed.
      const destructive = [
        'btn_clear_all_data',
        'btn_reset_options',
        'btn_forget_credentials',
      ];
      if (
        destructive.includes(button.id) &&
        !window.confirm(`${button.textContent.trim()}?`)
      ) {
        return;
      }
      try {
        switch (button.id) {
          case 'btn_clear_all_data':
            await clearData('all');
            location.reload();
            break;
          case 'btn_reset_options':
            await initDefaults();
            // The form was filled from the old values
            location.reload();
            break;
          case 'btn_clear_cache':
            await clearData('cache');
            break;
          case 'btn_forget_credentials':
            await clearData('credentials');
            break;
          case 'btn_create_db':
            if (IS_DEV_BUILD) await createDB();
        }
      } catch (error) {
        console.error(`[options] ${button.id} failed:`, error);
        window.alert(`${button.textContent.trim()}: ${error?.message ?? error}`);
      }
    }

    if (event.target.id === 'btn_show_options') {
      window.open('displayJson.html?type=options', 'Options', 'popup');
    }
    if (event.target.id === 'btn_show_cache') {
      window.open('displayJson.html?type=cache', 'Options', 'popup');
    }
  });
}

function createDB() {
  const dbVersion = document.getElementById('input_dbVersion').value;
  return createOldDatabase(dbVersion);
}
