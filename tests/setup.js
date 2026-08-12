/**
 * Test setup file
 * Runs before all tests to configure the test environment
 */

import { vi, afterEach } from 'vitest';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

// Mock Chrome Extension APIs
global.chrome = {
  tabs: {
    query: vi.fn().mockResolvedValue([
      {
        id: 1,
        url: 'https://example.com',
        title: 'Example Page',
      },
    ]),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([
      {
        result: '<html><body>Test content</body></html>',
      },
    ]),
  },
  runtime: {
    onSuspend: {
      addListener: vi.fn(),
    },
    getContexts: vi.fn(),
    sendMessage: vi.fn(),
    getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
  },
  offscreen: {
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  contextMenus: {
    removeAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(),
    setIcon: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([
      {
        result: '<html><body>Test content</body></html>',
      },
    ]),
  },
};

// Suppress console logs in tests unless explicitly needed
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: console.warn,
  error: console.error,
};

// ---------------------------------------------------------------------------
// Global restore (required by test.isolate: false)
//
// The jsdom environment is now shared across test files in a worker. Eight
// suites replace globalThis.document / globalThis.window with mocks inside
// their beforeEach hooks; without this restore the last one to run leaks its
// mock into every file scheduled after it, producing order-dependent failures
// such as "document.createElement is not a function" in unrelated suites.
//
// Every such assignment lives inside beforeEach/it, never at module scope, so
// restoring after each test is safe -- each suite re-establishes what it needs.
// ---------------------------------------------------------------------------
// navigator is included because hydrateForm.test.js deletes it outright, which
// otherwise breaks any later suite reaching navigator.language (getFolders).
const pristineDocument = globalThis.document;
const pristineWindow = globalThis.window;
const pristineNavigator = globalThis.navigator;

afterEach(() => {
  globalThis.document = pristineDocument;
  globalThis.window = pristineWindow;
  globalThis.navigator = pristineNavigator;
});
