// https://developer.chrome.com/docs/extensions/mv3/options/
import {
  load_data_all,
  load_data,
  store_data,
  initDefaults,
  clearData,
  createOldDatabase,
} from '../lib/storage.js';

const OPTION_STORE = 'options';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    document.querySelectorAll('[i18n-data]').forEach((element) => {
      console.dir(element);
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
    if (document.readyState === 'complete') {
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
    }
  }
};

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
    document
      .getElementById(`${previousValue}`)
      .classList.remove('selected_heading');
    document.getElementById('input_headings_slider').value = event.target.id;
    document
      .getElementById(`${event.target.id}`)
      .classList.add('selected_heading');
    store_data(OPTION_STORE, { input_headings_slider: parseInt(slider.value) });
  });

// color numbers id sets slider
// save value to database
const slider = document.getElementById('input_headings_slider');
slider.addEventListener('input', () => {
  const previous_value = slider.getAttribute('data');
  document
    .getElementById(`${previous_value}`)
    .classList.remove('selected_heading');
  document.getElementById(`${slider.value}`).classList.add('selected_heading');
  slider.setAttribute('data', slider.value);
  store_data(OPTION_STORE, { input_headings_slider: parseInt(slider.value) });
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
        .classList.add('selected_heading');
    }
  });

  // --- set event listeners

  // --- set listner for changes on input_networkTimeout
  const input_networkTimeout = document.getElementById('input_networkTimeout');
  input_networkTimeout.addEventListener('input', () => {
    store_data(OPTION_STORE, {
      input_networkTimeout: parseInt(input_networkTimeout.value),
    });
  });

  options.addEventListener('click', async (event) => {
    if (event.target.type === 'checkbox') {
      const { id, checked } = event.target;
      store_data(OPTION_STORE, { [id]: checked });
    }
    if (event.target.type === 'submit') {
      console.log('submit', event.target.id);
      switch (event.target.id) {
        case 'btn_clear_all_data':
          clearData('all');
          break;
        case 'btn_reset_options':
          initDefaults();
          break;
        case 'btn_clear_cache':
          clearData('cache');
          break;
        case 'btn_create_db':
          createDB();
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
  console.log('createDB', dbVersion);
  createOldDatabase(dbVersion);
}
