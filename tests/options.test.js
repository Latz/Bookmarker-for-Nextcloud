/**
 * Unit tests for options.js
 * Tests the options page UI, tab switching, form initialization, and event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  ...global.chrome,
  i18n: {
    getMessage: vi.fn((key) => `[i18n:${key}]`),
  },
};

// Mock Tagify - needs to be a constructor function
vi.mock('@yaireo/tagify', () => {
  const mockTagifyInstance = {
    on: vi.fn(),
    addTags: vi.fn(),
    value: [],
  };
  return {
    default: vi.fn(function() {
      return mockTagifyInstance;
    }),
  };
});

// Mock modules
vi.mock('../src/lib/storage.js', () => ({
  load_data_all: vi.fn(),
  load_data: vi.fn(),
  store_data: vi.fn(),
  getOption: vi.fn(),
  initDefaults: vi.fn(),
  clearData: vi.fn(),
  createOldDatabase: vi.fn(),
}));

vi.mock('../src/background/modules/getFolders.js', () => ({
  getFolders: vi.fn(() => Promise.resolve('<option value="1">Folder 1</option>')),
}));

vi.mock('../src/popup/modules/fillFolders.js', () => ({
  default: vi.fn(),
}));

// Import after mocking
import Tagify from '@yaireo/tagify';
import {
  load_data_all,
  load_data,
  store_data,
  getOption,
  initDefaults,
  clearData,
  createOldDatabase,
} from '../src/lib/storage.js';
import { getFolders } from '../src/background/modules/getFolders.js';

describe('options.js', () => {
  let mockDocument;
  let mockElements;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create mock DOM elements
    mockElements = {
      // Tab elements
      tab_basic: {
        id: 'tab_basic',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      tab_advanced: {
        id: 'tab_advanced',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      tab_zen: {
        id: 'tab_zen',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      // Content elements
      content_tab_basic: {
        id: 'content_tab_basic',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      content_tab_advanced: {
        id: 'content_tab_advanced',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      content_tab_zen: {
        id: 'content_tab_zen',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      // Tabs container
      tabs: {
        id: 'tabs',
        addEventListener: vi.fn(),
      },
      // Zen folders
      zen_folders: {
        id: 'zen_folders',
        innerHTML: '',
        options: [
          { value: '-1', selected: false },
          { value: '1', selected: false },
          { value: '2', selected: false },
        ],
        addEventListener: vi.fn(),
      },
      // Zen keywords input
      input_zenKeywords: {
        id: 'input_zenKeywords',
        value: '',
      },
      // Heading selectors
      heading_selectors: {
        id: 'heading_selectors',
        addEventListener: vi.fn(),
      },
      input_headings_slider: {
        id: 'input_headings_slider',
        value: '3',
        getAttribute: vi.fn(() => '3'),
        setAttribute: vi.fn(),
        addEventListener: vi.fn(),
      },
      // Heading numbers
      '1': { id: '1', classList: { add: vi.fn(), remove: vi.fn() } },
      '2': { id: '2', classList: { add: vi.fn(), remove: vi.fn() } },
      '3': { id: '3', classList: { add: vi.fn(), remove: vi.fn() } },
      '4': { id: '4', classList: { add: vi.fn(), remove: vi.fn() } },
      '5': { id: '5', classList: { add: vi.fn(), remove: vi.fn() } },
      '6': { id: '6', classList: { add: vi.fn(), remove: vi.fn() } },
      // Options content container
      content: {
        id: 'content',
        addEventListener: vi.fn(),
      },
      // Form elements
      input_networkTimeout: {
        id: 'input_networkTimeout',
        value: '3000',
        addEventListener: vi.fn(),
      },
      // Buttons
      btn_clear_all_data: { id: 'btn_clear_all_data', type: 'submit' },
      btn_reset_options: { id: 'btn_reset_options', type: 'submit' },
      btn_clear_cache: { id: 'btn_clear_cache', type: 'submit' },
      btn_create_db: { id: 'btn_create_db', type: 'submit' },
      btn_show_options: { id: 'btn_show_options' },
      btn_show_cache: { id: 'btn_show_cache' },
      // Checkboxes
      cbx_enableZen: { id: 'cbx_enableZen', type: 'checkbox', checked: false },
      cbx_autoTags: { id: 'cbx_autoTags', type: 'checkbox', checked: false },
      // Active inactive indicator
      activeInactive: { innerHTML: '' },
      // Database version input
      input_dbVersion: { id: 'input_dbVersion', value: '1.0' },
      // I18n elements
      i18nElement1: { getAttribute: vi.fn(() => 'test_key'), innerText: '' },
      i18nElement2: { getAttribute: vi.fn(() => 'another_key'), innerText: '' },
    };

    // Mock document
    mockDocument = {
      readyState: 'complete',
      querySelectorAll: vi.fn(() => [
        mockElements.i18nElement1,
        mockElements.i18nElement2,
      ]),
      getElementById: vi.fn((id) => mockElements[id] || null),
      addEventListener: vi.fn(),
    };

    // Set up global document
    global.document = mockDocument;
    global.window = {
      open: vi.fn(),
    };

    // Set up global variables for elements accessed directly (browser creates these for IDs)
    global.zen_folders = mockElements.zen_folders;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up global variables that the browser would create
    if (global.zen_folders) delete global.zen_folders;
  });

  describe('Document ready state handling', () => {
    it('should initialize when document readyState is complete', async () => {
      // Setup mocks for initialization
      load_data.mockResolvedValue(undefined); // activeTab
      load_data_all.mockResolvedValue([]); // optionsData
      getOption.mockResolvedValue(false); // zenModeEnabled
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');
      load_data.mockResolvedValue(undefined); // zenFolderIDs

      // Import and trigger the onreadystatechange handler
      await import('../src/options/options.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }

      // Verify i18n elements were processed
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[i18n-data]');
      expect(mockElements.i18nElement1.innerText).toBe('[i18n:test_key]');
      expect(mockElements.i18nElement2.innerText).toBe('[i18n:another_key]');
    });

    it('should not initialize when document readyState is not complete', async () => {
      mockDocument.readyState = 'loading';

      // Import the module
      await import('../src/options/options.js');

      // The readyState handler should not trigger initialization
      expect(mockElements.content.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('Tab switching', () => {
    beforeEach(async () => {
      load_data.mockResolvedValue(undefined); // activeTab
      load_data_all.mockResolvedValue([]); // optionsData
      getOption.mockResolvedValue(false); // zenModeEnabled
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');
      load_data.mockResolvedValue(undefined); // zenFolderIDs

      await import('../src/options/options.js');

      // Trigger the ready state handler
      const onreadystatechange = mockDocument.onreadystatechange;
      if (onreadystatechange) {
        await onreadystatechange();
      }
    });

    it('should load stored active tab on initialization', async () => {
      // Reset and setup for this specific test
      vi.resetModules();
      load_data.mockImplementation((store, key) => {
        if (key === 'activeTab') return Promise.resolve('tab_advanced');
        if (key === 'zenFolderIDs') return Promise.resolve(['-1']);
        return Promise.resolve(undefined);
      });
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();

      // Verify the stored tab is activated
      expect(mockElements.tab_basic.classList.remove).toHaveBeenCalledWith('tab-active');
      expect(mockElements.tab_advanced.classList.add).toHaveBeenCalledWith('tab-active');
      expect(mockElements.content_tab_advanced.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should handle tab click to switch content', async () => {
      // Get the click handler
      const tabsClickHandler = mockElements.tabs.addEventListener.mock.calls[0][1];

      // Simulate clicking on tab_advanced
      tabsClickHandler({ target: mockElements.tab_advanced });

      // Verify tab switching
      expect(mockElements.tab_advanced.classList.add).toHaveBeenCalledWith('tab-active');
      expect(mockElements.tab_basic.classList.remove).toHaveBeenCalledWith('tab-active');
      expect(mockElements.content_tab_basic.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.content_tab_advanced.classList.remove).toHaveBeenCalledWith('hidden');

      // Verify active tab was stored
      expect(store_data).toHaveBeenCalledWith('options', { activeTab: 'tab_advanced' });
    });

    it('should not switch if clicking the same tab', async () => {
      const tabsClickHandler = mockElements.tabs.addEventListener.mock.calls[0][1];

      // Reset the mock to clear previous calls
      vi.clearAllMocks();

      // Simulate clicking on the already active tab
      tabsClickHandler({ target: mockElements.tab_basic });

      // Should not call store_data since tab didn't change
      // The code checks activeTab === event.target, which compares references
      // Since our mock objects are the same reference, it should return early
      // Note: The test verifies that no class changes occur for the same tab
      expect(mockElements.tab_basic.classList.add).not.toHaveBeenCalled();
      expect(mockElements.tab_basic.classList.remove).not.toHaveBeenCalled();
    });
  });

  describe('Zen folders selection', () => {
    beforeEach(async () => {
      load_data.mockImplementation((store, key) => {
        if (key === 'zenFolderIDs') return Promise.resolve(['1', '2']);
        return Promise.resolve(undefined);
      });
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();
    });

    it('should fill zen folders selection box', async () => {
      expect(getFolders).toHaveBeenCalledWith(true);
      expect(mockElements.zen_folders.innerHTML).toBe('<option value="1">Folder 1</option><option value="2">Folder 2</option>');
    });

    it('should select previously stored folders', async () => {
      // Verify that the options with values '1' and '2' are selected
      expect(mockElements.zen_folders.options[1].selected).toBe(true);
      expect(mockElements.zen_folders.options[2].selected).toBe(true);
    });

    it('should store selected folders on change', async () => {
      // Setup options with selection
      mockElements.zen_folders.options = [
        { value: '-1', selected: false },
        { value: '1', selected: true },
        { value: '2', selected: true },
      ];

      // Get the change handler
      const changeHandler = mockElements.zen_folders.addEventListener.mock.calls[0][1];

      // Simulate change event
      changeHandler({ target: mockElements.zen_folders });

      // Verify folders are stored
      expect(store_data).toHaveBeenCalledWith('options', { zenFolderIDs: ['1', '2'] });
    });

    it('should default to -1 if no folders stored', async () => {
      vi.resetModules();
      load_data.mockImplementation((store, key) => {
        if (key === 'zenFolderIDs') return Promise.resolve(undefined);
        return Promise.resolve(undefined);
      });
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="-1">All</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();

      // Should default to -1
      expect(mockElements.zen_folders.options[0].selected).toBe(true);
    });
  });

  describe('Zen keywords (Tagify)', () => {
    let mockTagifyInstance;

    beforeEach(async () => {
      // Create a new mock instance for each test
      mockTagifyInstance = {
        on: vi.fn(),
        addTags: vi.fn(),
        value: [{ value: 'tag1' }, { value: 'tag2' }],
      };

      // Reset the mock and set up a new instance
      Tagify.mockImplementation(function() {
        return mockTagifyInstance;
      });

      load_data.mockImplementation((store, key) => {
        if (key === 'input_zenKeywords') return Promise.resolve(['keyword1', 'keyword2']);
        return Promise.resolve(undefined);
      });
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();
    });

    it('should initialize Tagify on the keywords input', async () => {
      expect(Tagify).toHaveBeenCalledWith(mockElements.input_zenKeywords, {
        backspace: 'edit',
        dropdown: {
          maxItems: 5,
          highlightFirst: true,
        },
      });
    });

    it('should load and add stored keywords to Tagify', async () => {
      expect(mockTagifyInstance.addTags).toHaveBeenCalledWith(['keyword1', 'keyword2']);
    });

    it('should register event handlers for add and remove', async () => {
      expect(mockTagifyInstance.on).toHaveBeenCalledWith('add', expect.any(Function));
      expect(mockTagifyInstance.on).toHaveBeenCalledWith('remove', expect.any(Function));
    });

    it('should save tags when add event is triggered', async () => {
      // Get the add event handler
      const addHandler = mockTagifyInstance.on.mock.calls.find(call => call[0] === 'add')[1];

      // Trigger the handler
      addHandler();

      // Verify store_data was called with the tags
      expect(store_data).toHaveBeenCalledWith('options', {
        input_zenKeywords: ['tag1', 'tag2'],
      });
    });

    it('should save tags when remove event is triggered', async () => {
      // Get the remove event handler
      const removeHandler = mockTagifyInstance.on.mock.calls.find(call => call[0] === 'remove')[1];

      // Trigger the handler
      removeHandler();

      // Verify store_data was called with the tags
      expect(store_data).toHaveBeenCalledWith('options', {
        input_zenKeywords: ['tag1', 'tag2'],
      });
    });
  });

  describe('Heading slider', () => {
    beforeEach(async () => {
      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([
        { item: 'input_headings_slider', value: 3 },
      ]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();
    });

    it('should set slider data attribute on initialization', async () => {
      expect(mockElements.input_headings_slider.setAttribute).toHaveBeenCalledWith('data', 3);
      expect(mockElements['3'].classList.add).toHaveBeenCalledWith('selected_heading');
    });

    it('should handle click on heading number to set slider', async () => {
      // Get the click handler
      const clickHandler = mockElements.heading_selectors.addEventListener.mock.calls[0][1];

      // Simulate clicking on heading number 5
      clickHandler({ target: mockElements['5'] });

      // Verify slider value is updated
      expect(mockElements.input_headings_slider.value).toBe('5');

      // Verify previous heading is deselected
      expect(mockElements['3'].classList.remove).toHaveBeenCalledWith('selected_heading');

      // Verify new heading is selected
      expect(mockElements['5'].classList.add).toHaveBeenCalledWith('selected_heading');

      // Verify data is stored
      expect(store_data).toHaveBeenCalledWith('options', { input_headings_slider: 5 });
    });

    it('should not do anything if clicking on the container itself', async () => {
      const clickHandler = mockElements.heading_selectors.addEventListener.mock.calls[0][1];

      // Simulate clicking on the container (not a number)
      clickHandler({ target: mockElements.heading_selectors });

      // Should not update slider or store data
      expect(store_data).not.toHaveBeenCalledWith('options', expect.any(Object));
    });

    it('should handle slider input event', async () => {
      // Get the input handler
      const inputHandler = mockElements.input_headings_slider.addEventListener.mock.calls[0][1];

      // Simulate slider change
      mockElements.input_headings_slider.value = '4';
      inputHandler();

      // Verify previous heading is deselected
      expect(mockElements['3'].classList.remove).toHaveBeenCalledWith('selected_heading');

      // Verify new heading is selected
      expect(mockElements['4'].classList.add).toHaveBeenCalledWith('selected_heading');

      // Verify data attribute is updated
      expect(mockElements.input_headings_slider.setAttribute).toHaveBeenCalledWith('data', '4');

      // Verify data is stored
      expect(store_data).toHaveBeenCalledWith('options', { input_headings_slider: 4 });
    });
  });

  describe('Network timeout input', () => {
    beforeEach(async () => {
      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([
        { item: 'input_networkTimeout', value: 5000 },
      ]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();
    });

    it('should set initial value from stored data', async () => {
      expect(mockElements.input_networkTimeout.value).toBe(5000);
    });

    it('should store value on input change', async () => {
      // Get the input handler
      const inputHandler = mockElements.input_networkTimeout.addEventListener.mock.calls[0][1];

      // Simulate input change
      mockElements.input_networkTimeout.value = '10000';
      inputHandler();

      // Verify data is stored as integer
      expect(store_data).toHaveBeenCalledWith('options', { input_networkTimeout: 10000 });
    });
  });

  describe('Options content click handler', () => {
    beforeEach(async () => {
      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();
    });

    it('should handle checkbox changes', async () => {
      // Get the click handler
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      // Simulate clicking a checkbox
      clickHandler({ target: mockElements.cbx_enableZen });

      // Verify checkbox state is stored
      expect(store_data).toHaveBeenCalledWith('options', { cbx_enableZen: false });
    });

    it('should handle clear all data button', async () => {
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      clickHandler({ target: mockElements.btn_clear_all_data });

      expect(clearData).toHaveBeenCalledWith('all');
    });

    it('should handle reset options button', async () => {
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      clickHandler({ target: mockElements.btn_reset_options });

      expect(initDefaults).toHaveBeenCalled();
    });

    it('should handle clear cache button', async () => {
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      clickHandler({ target: mockElements.btn_clear_cache });

      expect(clearData).toHaveBeenCalledWith('cache');
    });

    it('should handle create database button', async () => {
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      clickHandler({ target: mockElements.btn_create_db });

      expect(createOldDatabase).toHaveBeenCalledWith('1.0');
    });

    it('should open options display window', async () => {
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      clickHandler({ target: mockElements.btn_show_options });

      expect(window.open).toHaveBeenCalledWith(
        'displayJson.html?type=options',
        'Options',
        'popup'
      );
    });

    it('should open cache display window', async () => {
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      clickHandler({ target: mockElements.btn_show_cache });

      expect(window.open).toHaveBeenCalledWith(
        'displayJson.html?type=cache',
        'Options',
        'popup'
      );
    });

    it('should not handle non-button clicks', async () => {
      const clickHandler = mockElements.content.addEventListener.mock.calls[0][1];

      // Click on a non-interactive element
      clickHandler({ target: { type: 'text', id: 'some_text' } });

      // Should not call any storage functions
      expect(store_data).not.toHaveBeenCalled();
      expect(clearData).not.toHaveBeenCalled();
    });
  });

  describe('setOptions function', () => {
    beforeEach(async () => {
      // Reset and set up fresh mocks
      vi.resetModules();
      Tagify.mockImplementation(function() {
        return {
          on: vi.fn(),
          addTags: vi.fn(),
          value: [],
        };
      });

      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();
    });

    it('should set checkbox values from stored data', async () => {
      // Reset and re-import with specific data
      vi.resetModules();
      Tagify.mockImplementation(function() {
        return {
          on: vi.fn(),
          addTags: vi.fn(),
          value: [],
        };
      });

      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([
        { item: 'cbx_enableZen', value: true },
        { item: 'cbx_autoTags', value: false },
      ]);
      getOption.mockResolvedValue(true);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();

      expect(mockElements.cbx_enableZen.checked).toBe(true);
      expect(mockElements.cbx_autoTags.checked).toBe(false);
    });

    it('should set input values from stored data', async () => {
      vi.resetModules();
      Tagify.mockImplementation(function() {
        return {
          on: vi.fn(),
          addTags: vi.fn(),
          value: [],
        };
      });

      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([
        { item: 'input_networkTimeout', value: 8000 },
      ]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();

      expect(mockElements.input_networkTimeout.value).toBe(8000);
    });

    it('should update active/inactive indicator based on zen mode', async () => {
      vi.resetModules();
      Tagify.mockImplementation(function() {
        return {
          on: vi.fn(),
          addTags: vi.fn(),
          value: [],
        };
      });

      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(true); // zen mode enabled
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();

      expect(getOption).toHaveBeenCalledWith('cbx_enableZen');
      expect(mockElements.activeInactive.innerHTML).toBe('[i18n:active]');
    });

    it('should show inactive when zen mode is disabled', async () => {
      vi.resetModules();
      Tagify.mockImplementation(function() {
        return {
          on: vi.fn(),
          addTags: vi.fn(),
          value: [],
        };
      });

      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([]);
      getOption.mockResolvedValue(false); // zen mode disabled
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();

      expect(mockElements.activeInactive.innerHTML).toBe('[i18n:inactive]');
    });
  });

  describe('Error handling', () => {
    it('should handle undefined stored values in setOptions', async () => {
      vi.resetModules();
      Tagify.mockImplementation(function() {
        return {
          on: vi.fn(),
          addTags: vi.fn(),
          value: [],
        };
      });

      load_data.mockResolvedValue(undefined);
      load_data_all.mockResolvedValue([
        { item: 'cbx_enableZen', value: undefined },
        { item: 'input_networkTimeout', value: undefined },
      ]);
      getOption.mockResolvedValue(false);
      getFolders.mockResolvedValue('<option value="1">Folder 1</option>');

      await import('../src/options/options.js');
      await mockDocument.onreadystatechange();

      // Should not throw, values should be set to undefined
      expect(mockElements.cbx_enableZen.checked).toBe(undefined);
    });
  });
});
