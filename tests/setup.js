/**
 * Test setup file
 * Runs before all tests to configure the test environment
 */

import { vi } from 'vitest';

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
