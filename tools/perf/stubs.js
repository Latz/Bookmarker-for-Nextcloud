// Runtime stand-ins so the extension's modules run under plain Node:
// an IndexedDB implementation (fake-indexeddb) and a chrome.* mock.
//
// The chrome mock decides what answers "instantly" (session storage, context
// menus, icons, permissions). Numbers that involve it -- the service worker
// start in particular -- are therefore only comparable between revisions
// measured with the same mock, not against a real browser.
import 'fake-indexeddb/auto';

/** Session storage contents; tests may seed it before the modules read it. */
export const sessionStore = {};

export function installChrome() {
  const noop = () => {};
  const listener = { addListener: noop, removeListener: noop };
  globalThis.chrome = {
    runtime: {
      id: 'perf-extension-id',
      getURL: (path) => `chrome-extension://perf-extension-id/${String(path).replace(/^\//, '')}`,
      sendMessage: async () => undefined,
      onMessage: listener,
      onSuspend: listener,
      getContexts: async () => [],
      lastError: undefined,
    },
    storage: {
      session: {
        get: async (key) => (key in sessionStore ? { [key]: sessionStore[key] } : {}),
        set: async (values) => {
          Object.assign(sessionStore, values);
        },
      },
    },
    action: { setIcon: async () => {}, setBadgeText: async () => {} },
    contextMenus: {
      removeAll: async () => {},
      create: noop,
      update: async () => {},
      onClicked: listener,
    },
    permissions: { contains: async () => true, request: async () => true },
    notifications: {
      create: async () => 'notification-id',
      clear: async () => true,
      onButtonClicked: listener,
      onClicked: listener,
    },
    i18n: { getMessage: (key) => key },
    tabs: { query: async () => [], create: async () => ({ id: 1 }), remove: async () => {} },
    offscreen: { createDocument: async () => {}, hasDocument: async () => true },
  };
}

installChrome();
