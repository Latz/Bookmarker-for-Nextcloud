// @ts-check
// https://developer.chrome.com/docs/extensions/mv3/options/
//
// Options page. Settings are stored as soon as they change (there is no save
// button). The form elements are linked to stored options by their id prefix:
//   cbx_*    checkbox  -> boolean option
//   input_*  text/number/slider -> value option
// Everything is stored in the 'options' store via storage.js.
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

import { listModels, testProvider } from '../lib/aiClient.js';
import { AI_PROVIDERS, getProvider } from '../lib/aiProviders.js';
import { renderAiPanel, showAiProvider } from './aiPanel.js';
import {
  clampTimeoutSetting,
  DEFAULT_TIMEOUT_SECONDS,
} from '../lib/networkTimeout.js';

const OPTION_STORE = 'options';
// `vite build --mode development` keeps the developer tools; production hides them.
const IS_DEV_BUILD =
  import.meta.env?.DEV || import.meta.env?.MODE === 'development';
// The Tagify instance of the zen keywords field (used by saveZenTags).
let tagify;

// Page setup once the document is loaded: translations, tab state, zen
// keywords and zen folders.
document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    // Translate all elements marked with an i18n-data attribute.
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

    // Fill the form from the stored values (not awaited: the tab handling
    // below does not depend on it).
    void setOptions();

    // Tab switching: show the content that belongs to the clicked tab and
    // remember the choice, so the page reopens on the same tab.
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
      void store_data(OPTION_STORE, { activeTab: activeTab.id });
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
      void store_data(OPTION_STORE, { zenFolderIDs: selected });
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

/** Stores the current zen keyword tags (Tagify add/remove handler). */
function saveZenTags() {
  const tags = tagify.value.map((tag) => tag.value);
  void store_data(OPTION_STORE, { input_zenKeywords: tags });
}

// --- headings depth ---------------------------------------------------------------
// The "headings depth" setting (how many heading levels h1..hN are searched for
// keywords) can be changed in two ways that must stay in sync: by clicking one
// of the numbers next to the slider (handler below) or by moving the slider
// itself (handler further down).
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
    void store_data(OPTION_STORE, {
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
  void store_data(OPTION_STORE, {
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

  // The AI fields must exist before the stored values are filled in
  renderAiPanel(
    document.getElementById('ai_providers'),
    document.getElementById('ai_panels'),
  );

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
      void store_data(OPTION_STORE, { input_networkTimeout: seconds });
    }
  });
  // Show the value that is actually in effect once the user leaves the field
  input_networkTimeout.addEventListener('change', () => {
    input_networkTimeout.value = String(
      clampTimeoutSetting(input_networkTimeout.value) ??
        DEFAULT_TIMEOUT_SECONDS,
    );
  });

  setupAiOptions(
    optionsData.find((option) => option.item === 'select_aiProvider')?.value,
  );

  if (!IS_DEV_BUILD) {
    // "Create old database" deletes the real database and installs fake
    // credentials; it exists for development only.
    document
      .getElementById('input_dbVersion')
      ?.parentElement?.classList.add('hidden');
  }

  // One delegated click listener for the whole options area: checkboxes are
  // stored immediately, buttons trigger the maintenance actions below.
  options.addEventListener('click', async (event) => {
    if (event.target.type === 'checkbox') {
      const { id, checked } = event.target;

      void store_data(OPTION_STORE, { [id]: checked });
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
        window.alert(
          `${button.textContent.trim()}: ${error?.message ?? error}`,
        );
      }
    }

    // Developer views of the stored options / cached keywords, opened as a
    // small popup window (see displayJson.js).
    if (event.target.id === 'btn_show_options') {
      window.open('displayJson.html?type=options', 'Options', 'popup');
    }
    if (event.target.id === 'btn_show_cache') {
      window.open('displayJson.html?type=cache', 'Options', 'popup');
    }
  });
}

/**
 * AI tab: stores the provider, keys, models and base URLs as they are typed.
 * Choosing a provider asks for the host permission of its base URL.
 * @param {string} [selected] - Stored provider id ('off' or unset: none).
 */
function setupAiOptions(selected = 'off') {
  const cards = document.getElementById('ai_providers');
  const panels = document.getElementById('ai_panels');
  const errorBox = document.getElementById('ai_error');
  const showError = (message) => {
    errorBox.textContent = message ?? '';
    errorBox.classList.toggle('hidden', !message);
  };

  // Fills the model suggestions of a provider from its API (needs the host
  // permission for the base URL; otherwise the typed/stored model stays).
  const loadModels = async (provider, { silent = false } = {}) => {
    const value = (field) =>
      document.getElementById(`input_${provider.id}${field}`).value.trim();
    const origin = aiOrigin(value('BaseUrl'));
    if ((provider.needsKey && !value('ApiKey')) || !origin) {
      if (!silent) showError(chrome.i18n.getMessage('aiModelsFailed'));
      return;
    }
    try {
      // The button click is a user gesture, so it may ask for the permission
      // (answered at once if already granted); the automatic load only checks.
      const origins = { origins: [`${origin}/*`] };
      const granted = silent
        ? await chrome.permissions.contains(origins)
        : await chrome.permissions.request(origins);
      if (!granted) {
        if (!silent) showError(chrome.i18n.getMessage('aiPermissionDenied'));
        return;
      }
      const timeout = await load_data(OPTION_STORE, 'input_networkTimeout');
      const models = await listModels(
        provider.id,
        value('ApiKey'),
        value('BaseUrl'),
        timeout,
      );
      document.getElementById(`models_${provider.id}`).replaceChildren(
        ...models.map((model) => {
          const option = document.createElement('option');
          option.value = model.id;
          option.label = model.label;
          return option;
        }),
      );
      showError('');
    } catch (error) {
      if (!silent) {
        showError(
          `${chrome.i18n.getMessage('aiModelsFailed')}: ${error?.message ?? error}`,
        );
      }
    }
  };

  // Sends a tiny request with the values typed into the fields and shows
  // whether key, model and server work.
  const runTest = async (provider) => {
    const value = (field) =>
      document.getElementById(`input_${provider.id}${field}`).value.trim();
    const result = document.getElementById(`ai_test_${provider.id}`);
    const report = (message, ok) => {
      result.textContent = message;
      result.classList.toggle('text-success', ok);
      result.classList.toggle('text-error', !ok);
    };
    const t = (key) => chrome.i18n.getMessage(key);
    const origin = aiOrigin(value('BaseUrl'));
    if (!origin) return report(t('aiTestFailed'), false);
    result.classList.remove('text-success', 'text-error');
    result.textContent = t('aiTesting');
    try {
      const granted = await chrome.permissions.request({
        origins: [`${origin}/*`],
      });
      if (!granted) return report(t('aiPermissionDenied'), false);
      // The permission is granted now, so the model list can load alongside
      void loadModels(provider, { silent: true });
      await testProvider(provider.id, {
        apiKey: value('ApiKey'),
        model: value('Model'),
        baseUrl: value('BaseUrl'),
        timeoutSeconds: await load_data(OPTION_STORE, 'input_networkTimeout'),
      });
      report(t('aiTestOk'), true);
    } catch (error) {
      const reasons = {
        401: 'aiTestAuth',
        403: 'aiTestAuth',
        404: 'aiTestModel',
        429: 'aiTestLimit',
      };
      const reason = reasons[error?.status];
      report(
        reason
          ? `${t('aiTestFailed')}: ${t(reason)}`
          : `${t('aiTestFailed')}: ${error?.message ?? error}`,
        false,
      );
    }
  };

  for (const provider of AI_PROVIDERS) {
    let timer;
    for (const field of ['ApiKey', 'Model', 'BaseUrl']) {
      const input = document.getElementById(`input_${provider.id}${field}`);
      input.addEventListener('input', () => {
        void store_data(OPTION_STORE, { [input.id]: input.value.trim() });
        // Reload the model list once typing in the key/URL has paused
        if (field !== 'Model') {
          clearTimeout(timer);
          timer = setTimeout(
            () => void loadModels(provider, { silent: true }),
            600,
          );
        }
      });
    }
    document
      .getElementById(`btn_${provider.id}Models`)
      .addEventListener('click', () => void loadModels(provider));
    document
      .getElementById(`btn_${provider.id}Test`)
      .addEventListener('click', () => void runTest(provider));
  }

  showAiProvider(cards, panels, selected);
  const current = getProvider(selected);
  if (current) void loadModels(current, { silent: true });

  cards.addEventListener('change', async (event) => {
    showError('');
    const id = event.target.value;
    void store_data(OPTION_STORE, { select_aiProvider: id });
    showAiProvider(cards, panels, id);
    const provider = getProvider(id);
    if (!provider) return;
    const origin = aiOrigin(
      document.getElementById(`input_${id}BaseUrl`).value.trim(),
    );
    try {
      const granted = origin
        ? await chrome.permissions.request({ origins: [`${origin}/*`] })
        : false;
      if (granted) void loadModels(provider, { silent: true });
      else showError(chrome.i18n.getMessage('aiPermissionDenied'));
    } catch (error) {
      showError(error?.message ?? String(error));
    }
  });
}

/**
 * Origin of an AI server URL: https, or http for a local server (Ollama).
 * @param {string} baseUrl
 * @returns {string | null}
 */
function aiOrigin(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    const allowed =
      url.protocol === 'https:' || (local && url.protocol === 'http:');
    // Host permissions ignore the port, so the origin is built without it
    return allowed ? `${url.protocol}//${url.hostname}` : null;
  } catch {
    return null;
  }
}

/**
 * Development helper: recreates the database in an older schema version (the
 * version is taken from the input field) to test upgrades.
 * @returns {Promise<any>}
 */
function createDB() {
  const dbVersion = document.getElementById('input_dbVersion').value;
  return createOldDatabase(dbVersion);
}
