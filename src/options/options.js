// https://developer.chrome.com/docs/extensions/mv3/options/
import {
  load_data_all,
  load_data,
  store_data,
  getOption,
  getOptions,
  initDefaults,
  clearData,
  createOldDatabase,
} from '../lib/storage.js';
import Tagify from '@yaireo/tagify';
import { getFolders } from '../background/modules/getFolders.js';
import fillFolders from '../popup/modules/fillFolders.js';

const OPTION_STORE = 'options';
let tagify;
let folders; // Store folders globally for lazy loading
const loadedTabs = new Set(); // Track which tabs have been loaded

// Tab-specific option configuration for lazy loading
const TAB_OPTIONS = {
  tab_basic: [
    'cbx_displayFolders',
    'cbx_autoTags',
    'cbx_autoDescription',
    'cbx_successMessage',
  ],
  tab_zen: ['cbx_zenDisplayNotification', 'cbx_enableZen'],
  tab_advanced: [
    'cbx_alreadyStored',
    'cbx_showURL',
    'cbx_showDescription',
    'cbx_showKeywords',
    'cbx_extendedKeywords',
    'input_headings_slider',
    'input_networkTimeout',
    'select_duplicateStrategy',
    'cbx_fuzzyUrlMatch',
    'cbx_cacheBookmarkChecks',
    'input_bookmarkCacheTTL',
    'cbx_titleSimilarityCheck',
    'input_titleSimilarityThreshold',
  ],
  tab_dev: ['cbx_reduceKeywords'],
};

/**
 * Get option names for a specific tab
 * @param {string} tabId - The tab ID
 * @returns {Array<string>} Array of option names for the tab
 */
function getOptionNamesForTab(tabId) {
  return TAB_OPTIONS[tabId] || [];
}

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    // Internationalization
    document.querySelectorAll('[i18n-data]').forEach((element) => {
      element.innerText = chrome.i18n.getMessage(
        element.getAttribute('i18n-data'),
      );
    });

    // OPTIMIZATION: Parallelize independent async operations
    const [activeTabId, foldersHTML] = await Promise.all([
      load_data(OPTION_STORE, 'activeTab'),
      getFolders(true),
    ]);

    // Store folders globally for lazy tab loading
    folders = foldersHTML;

    // Set active tab
    let activeTab = activeTabId
      ? document.getElementById(activeTabId)
      : document.getElementById('tab_basic');

    // Update tab UI
    if (activeTabId && activeTabId !== 'tab_basic') {
      document.getElementById('tab_basic').classList.remove('tab-active');
      document.getElementById(activeTabId).classList.add('tab-active');
    }

    // OPTIMIZATION: Load ONLY active tab's options using cached batch API
    const tabOptionNames = getOptionNamesForTab(activeTab.id);
    const options = await getOptions(tabOptionNames);
    applyOptionsToDOMBatch(options);

    // Update zen mode status indicator
    const zenModeEnabled = await getOption('cbx_enableZen');
    const statusBadge = document.getElementById('activeInactive');
    if (zenModeEnabled) {
      statusBadge.innerHTML = chrome.i18n.getMessage('active');
      statusBadge.classList.add('badge-success');
      statusBadge.classList.remove('badge-ghost');
    } else {
      statusBadge.innerHTML = chrome.i18n.getMessage('inactive');
      statusBadge.classList.add('badge-ghost');
      statusBadge.classList.remove('badge-success');
    }

    // Mark active tab as loaded
    loadedTabs.add(activeTab.id);

    // Show active tab content
    const tabs = document.getElementById('tabs');
    activeTab.classList.add('tab-active');
    const activeContent = document.getElementById(`content_${activeTab.id}`);
    activeContent.classList.remove('hidden');

    // Initialize Tagify for zen keywords
    const tagsInput = document.getElementById('input_zenKeywords');
    tagify = new Tagify(tagsInput, {
      backspace: 'edit',
      dropdown: {
        maxItems: 5,
        highlightFirst: true,
      },
    });

    // OPTIMIZATION: Load zen data ONLY if on zen tab
    if (activeTab.id === 'tab_zen') {
      await loadZenTabData(folders);
    }

    // Set up zen event listeners
    const zen_folders = document.getElementById('zen_folders');
    zen_folders.addEventListener('change', (event) => {
      const input_zenFolders = document.getElementById('zen_folders');
      const selectedFolders = [];
      for (let folder of input_zenFolders.options) {
        if (folder.selected) {
          selectedFolders.push(folder.value);
        }
      }
      store_data(OPTION_STORE, { zenFolderIDs: selectedFolders });
    });

    tagify.on('add', saveZenTags);
    tagify.on('remove', saveZenTags);

    // OPTIMIZATION: Tab change handler with lazy loading
    tabs.addEventListener('click', async (event) => {
      if (activeTab === event.target) return;

      const targetTab = event.target;

      // Show loading skeleton if tab not loaded yet
      if (!loadedTabs.has(targetTab.id)) {
        showTabLoadingSkeleton(targetTab.id);
      }

      // Update UI immediately for snappy feel
      event.target.classList.add('tab-active');
      activeTab.classList.remove('tab-active');
      changeContent(activeTab, event.target);
      const previousTab = activeTab;
      activeTab = event.target;

      // Load tab options if not already loaded
      if (!loadedTabs.has(targetTab.id)) {
        try {
          const optionNames = getOptionNamesForTab(targetTab.id);
          const tabOptions = await getOptions(optionNames);
          applyOptionsToDOMBatch(tabOptions);

          // Load zen data if switching to zen tab
          if (targetTab.id === 'tab_zen') {
            await loadZenTabData(folders);
          }

          loadedTabs.add(targetTab.id);
        } finally {
          hideTabLoadingSkeleton(targetTab.id);
        }
      }

      store_data(OPTION_STORE, { activeTab: activeTab.id });
    });

    // Set up event listeners (from setOptions)
    setupEventListeners();
  }
};

function saveZenTags() {
  console.log('saveZenTags');
  let tags = [];
  tagify.value.forEach((tag) => {
    tags.push(tag.value);
  });
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
 * Apply options to DOM in batched fashion to minimize reflows
 * @param {Object} options - Object with option names as keys and values
 */
function applyOptionsToDOMBatch(options) {
  // Collect all updates in memory
  const updates = [];

  Object.entries(options).forEach(([item, value]) => {
    const element = document.getElementById(item);
    if (!element) return;

    if (item.startsWith('cbx')) {
      updates.push(() => (element.checked = value));
    } else if (item.startsWith('input')) {
      updates.push(() => (element.value = value));
    } else if (item.startsWith('select')) {
      updates.push(() => (element.value = value));
    }

    // Special case: heading slider
    if (item === 'input_headings_slider') {
      updates.push(() => {
        element.setAttribute('data', value);
        document
          .getElementById(`${value}`)
          .classList.add('selected_heading');
      });
    }
  });

  // Apply all updates in single requestAnimationFrame
  // This batches all DOM changes into one reflow
  requestAnimationFrame(() => {
    updates.forEach((update) => update());
  });
}

/**
 * Show loading skeleton for a tab
 * @param {string} tabId - The tab ID
 */
function showTabLoadingSkeleton(tabId) {
  const contentId = `content_${tabId}`;
  const skeleton = document.querySelector(`#${contentId} .skeleton-loader`);
  if (skeleton) {
    skeleton.classList.remove('hidden');
  }
}

/**
 * Hide loading skeleton for a tab
 * @param {string} tabId - The tab ID
 */
function hideTabLoadingSkeleton(tabId) {
  const contentId = `content_${tabId}`;
  const skeleton = document.querySelector(`#${contentId} .skeleton-loader`);
  if (skeleton) {
    skeleton.classList.add('hidden');
  }
}

/**
 * Load zen tab specific data (folders and keywords)
 * @param {string} foldersHTML - Pre-rendered folders HTML
 */
async function loadZenTabData(foldersHTML) {
  // Fill folders dropdown
  const input_zenFolders = document.getElementById('zen_folders');
  input_zenFolders.innerHTML = foldersHTML;

  // Load zen options in parallel
  const [zenFolderIDs, zenKeywords] = await Promise.all([
    load_data(OPTION_STORE, 'zenFolderIDs'),
    load_data(OPTION_STORE, 'input_zenKeywords'),
  ]);

  // Select folders
  const folderIDsArray = zenFolderIDs || ['-1'];
  for (const option of input_zenFolders.options) {
    option.selected = folderIDsArray.includes(option.value);
  }

  // Fill zen keywords
  if (zenKeywords) {
    tagify.addTags(zenKeywords);
  }
}

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
 * Set up event listeners for options page
 * Separated from data loading for better performance
 */
function setupEventListeners() {
  const options = document.getElementById('content');

  // Listener for network timeout input
  const input_networkTimeout = document.getElementById('input_networkTimeout');
  input_networkTimeout?.addEventListener('input', () => {
    store_data(OPTION_STORE, {
      input_networkTimeout: parseInt(input_networkTimeout.value),
    });
  });

  // Listener for duplicate strategy select
  const select_duplicateStrategy = document.getElementById(
    'select_duplicateStrategy',
  );
  select_duplicateStrategy?.addEventListener('change', () => {
    store_data(OPTION_STORE, {
      select_duplicateStrategy: select_duplicateStrategy.value,
    });
  });

  // Listener for bookmark cache TTL input
  const input_bookmarkCacheTTL = document.getElementById(
    'input_bookmarkCacheTTL',
  );
  input_bookmarkCacheTTL?.addEventListener('input', () => {
    store_data(OPTION_STORE, {
      input_bookmarkCacheTTL: parseInt(input_bookmarkCacheTTL.value),
    });
  });

  // Listener for title similarity threshold slider
  const input_titleSimilarityThreshold = document.getElementById(
    'input_titleSimilarityThreshold',
  );
  const titleSimilarityValue = document.getElementById('titleSimilarityValue');
  input_titleSimilarityThreshold?.addEventListener('input', () => {
    const value = parseInt(input_titleSimilarityThreshold.value);
    if (titleSimilarityValue) {
      titleSimilarityValue.textContent = `${value}%`;
    }
    store_data(OPTION_STORE, {
      input_titleSimilarityThreshold: value,
    });
  });

  // Delegated event listener for checkboxes, buttons, etc.
  options.addEventListener('click', async (event) => {
    if (event.target.type === 'checkbox') {
      const { id, checked } = event.target;
      console.log('checkbox', id, checked);
      store_data(OPTION_STORE, { [id]: checked });
    } else if (event.target.type === 'submit') {
      console.log('submit', event.target.id);
      handleSubmitButton(event.target.id);
    } else if (event.target.id === 'btn_show_options') {
      window.open('displayJson.html?type=options', 'Options', 'popup');
    } else if (event.target.id === 'btn_show_cache') {
      window.open('displayJson.html?type=cache', 'Options', 'popup');
    } else if (event.target.id === 'btn_cache_stats') {
      showCacheStats();
    }
  });
}

/**
 * Handle submit button clicks
 * @param {string} buttonId - The ID of the button clicked
 */
function handleSubmitButton(buttonId) {
  switch (buttonId) {
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
      break;
  }
}

async function showCacheStats() {
  const stats = await chrome.runtime.sendMessage({ msg: 'getCacheStats' });

  if (!stats) {
    alert('Failed to retrieve cache statistics');
    return;
  }

  // Format the statistics for display
  const statsText = `
📊 BOOKMARK CACHE STATISTICS
${'='.repeat(50)}

PERFORMANCE METRICS:
  • Cache Hit Rate: ${stats.hitRate}
  • Total Requests: ${stats.totalRequests}
  • Cache Hits: ${stats.hits}
  • Cache Misses: ${stats.misses}
  • Hash Collisions: ${stats.collisions}

CACHE SIZE:
  • Current Entries: ${stats.entries}
  • Maximum Entries: ${stats.maxEntries}
  • Utilization: ${stats.utilizationRate}
  • Total Stores: ${stats.stores}
  • Total Evictions: ${stats.evictions}

TIMESTAMPS:
  • Oldest Entry: ${stats.oldestEntry}
  • Newest Entry: ${stats.newestEntry}

TOP 10 MOST ACCESSED URLs:
${stats.topUrls
  .map(
    (u, i) => `  ${i + 1}. ${u.url}
     Access Count: ${u.accessCount} | Last: ${u.lastAccessed}`,
  )
  .join('\n')}

${'='.repeat(50)}
  `;

  // Create a modal or alert to display stats
  alert(statsText);
}

function createDB() {
  const dbVersion = document.getElementById('input_dbVersion').value;
  console.log('createDB', dbVersion);
  createOldDatabase(dbVersion);
}
