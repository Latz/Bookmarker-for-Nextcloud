# Session Cache for SW Cold-Start Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cache browser theme and error icon availability in `chrome.storage.session` so that service-worker cold starts skip expensive offscreen document roundtrips and fetch calls.

**Architecture:** `chrome.storage.session` persists across MV3 service worker terminations (but clears on browser close). Two module-level caches — `cachedTheme` in `getBrowserTheme.js` and `errorIconsAvailable` in `notification.js` — are reset to null/empty on every cold start. We intercept each cache miss, check session storage first, and fall through to the full detection only when session storage is also empty. After full detection, we write the result back to session storage. No new files — logic lives inside the two existing modules.

**Tech Stack:** `chrome.storage.session` (MV3 built-in), vitest, existing `_reset*ForTesting()` pattern for test isolation.

---

## Task 1: Theme — failing tests

**Files:**
- Modify: `tests/getBrowserTheme.test.js`

**Context:** The existing `global.chrome` mock in this test file doesn't include `chrome.storage.session`. We need to add it and write tests that describe the new session-cache behaviour.

**Step 1: Add `chrome.storage.session` to the global chrome mock**

In `tests/getBrowserTheme.test.js`, find the `global.chrome = { ... }` block at the top and add a `storage` key:

```js
global.chrome = {
  runtime: { /* ... existing ... */ },
  offscreen: { /* ... existing ... */ },
  storage: {
    session: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};
```

**Step 2: Add `chrome.storage.session` reset to the `beforeEach` blocks**

Both `describe('getBrowserTheme module', ...)` and `describe('Integration tests', ...)` have `beforeEach` blocks that call `vi.clearAllMocks()` — that already resets all mocked functions, so no extra reset is needed. But make sure `chrome.storage.session.set` returns a resolved promise by default so it never hangs:

Add to both `beforeEach` blocks (after `vi.clearAllMocks()`):
```js
chrome.storage.session.get.mockResolvedValue({});
chrome.storage.session.set.mockResolvedValue(undefined);
```

**Step 3: Add three new tests inside `describe('getBrowserTheme', ...)`**

```js
it('should return cached theme from session storage on cold start', async () => {
  // Session storage has a theme, module cache is empty
  chrome.storage.session.get.mockResolvedValue({ browserTheme: 'dark' });

  const theme = await getBrowserTheme();

  // Should return from session storage without any offscreen work
  expect(theme).toBe('dark');
  expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  expect(chrome.storage.session.get).toHaveBeenCalledWith('browserTheme');
});

it('should save detected theme to session storage', async () => {
  chrome.storage.session.get.mockResolvedValue({}); // Cache miss
  chrome.offscreen.hasDocument.mockResolvedValue(false);
  chrome.runtime.getContexts.mockResolvedValue([]);
  chrome.runtime.sendMessage.mockResolvedValue(true); // isLight=true → 'dark'

  await getBrowserTheme();

  expect(chrome.storage.session.set).toHaveBeenCalledWith({ browserTheme: 'dark' });
});

it('should fall through to full detection when session storage is empty', async () => {
  chrome.storage.session.get.mockResolvedValue({}); // No cached theme
  chrome.offscreen.hasDocument.mockResolvedValue(false);
  chrome.runtime.getContexts.mockResolvedValue([]);
  chrome.runtime.sendMessage.mockResolvedValue(false); // isLight=false → 'light'

  const theme = await getBrowserTheme();

  // Full detection was run
  expect(chrome.offscreen.createDocument).toHaveBeenCalled();
  expect(theme).toBe('light');
});
```

**Step 4: Run the new tests to confirm they fail**

```
npx vitest run --pool=threads tests/getBrowserTheme.test.js
```

Expected: the three new tests FAIL (module doesn't read/write session storage yet). All pre-existing tests pass.

---

## Task 2: Theme — implement session storage in `getBrowserTheme.js`

**Files:**
- Modify: `src/background/modules/getBrowserTheme.js`

**Step 1: Update `getBrowserTheme()` to read from session storage on cache miss**

Replace the body of `getBrowserTheme()` (lines 81–103) with:

```js
export default async function getBrowserTheme() {
  // Primary in-memory cache (fastest path — SW lifetime)
  if (cachedTheme !== null) {
    return cachedTheme;
  }

  // Secondary session cache (survives SW termination)
  if (chrome.storage?.session) {
    try {
      const stored = await chrome.storage.session.get('browserTheme');
      if (stored.browserTheme) {
        cachedTheme = stored.browserTheme;
        return cachedTheme;
      }
    } catch (_e) {
      // Session storage unavailable — fall through
    }
  }

  // Re-check in-memory cache (a concurrent call may have populated it while
  // we were awaiting session storage)
  if (cachedTheme !== null) {
    return cachedTheme;
  }

  // If there's already a request in flight, return that promise
  if (inflightThemeRequest) {
    return inflightThemeRequest;
  }

  // Full detection via offscreen document
  inflightThemeRequest = detectTheme();

  try {
    const result = await inflightThemeRequest;
    cachedTheme = result;
    // Persist to session storage for next cold start
    if (chrome.storage?.session) {
      chrome.storage.session.set({ browserTheme: result }).catch(() => {});
    }
    return result;
  } finally {
    inflightThemeRequest = null;
  }
}
```

**Step 2: Run the tests**

```
npx vitest run --pool=threads tests/getBrowserTheme.test.js
```

Expected: ALL tests pass, including the three new ones.

**Step 3: Run the full suite to check for regressions**

```
npx vitest run --pool=threads
```

Expected: 656+ tests pass, 0 failures.

**Step 4: Commit**

```bash
git add src/background/modules/getBrowserTheme.js tests/getBrowserTheme.test.js
git commit -m "perf: cache browser theme in chrome.storage.session for SW cold-start recovery"
```

---

## Task 3: Error icons — failing tests

**Files:**
- Modify: `tests/notification.test.js`

**Context:** The existing `global.chrome` mock does not include `chrome.storage.session`. We need to add it and write tests describing the new session-cache behaviour for `initializeErrorIconCache`.

**Step 1: Add `chrome.storage.session` to the global chrome mock**

In `tests/notification.test.js`, find the `global.chrome = { ... }` block and add:

```js
global.chrome = {
  runtime: { /* ... existing ... */ },
  notifications: { /* ... existing ... */ },
  i18n: { /* ... existing ... */ },
  storage: {
    session: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};
```

**Step 2: Add `initializeErrorIconCache` to the import**

The existing import line is:
```js
import { notifyUser, cacheRefreshNotification, _resetErrorIconCacheForTesting } from '../src/background/modules/notification.js';
```

Add `initializeErrorIconCache`:
```js
import {
  notifyUser,
  cacheRefreshNotification,
  initializeErrorIconCache,
  _resetErrorIconCacheForTesting,
} from '../src/background/modules/notification.js';
```

**Step 3: Add default mock values to the existing top-level `beforeEach` blocks**

In the `beforeEach` of `describe('notifyUser', ...)`, add after `vi.clearAllMocks()`:
```js
chrome.storage.session.get.mockResolvedValue({});
chrome.storage.session.set.mockResolvedValue(undefined);
```

Do the same in `describe('cacheRefreshNotification', ...)`.

**Step 4: Add a new `describe` block for `initializeErrorIconCache`**

```js
describe('initializeErrorIconCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetErrorIconCacheForTesting();
    chrome.storage.session.get.mockResolvedValue({});
    chrome.storage.session.set.mockResolvedValue(undefined);
  });

  it('should restore error icon cache from session storage on cold start', async () => {
    const cached = { light: true, dark: false };
    chrome.storage.session.get.mockResolvedValue({ errorIconsAvailable: cached });

    await initializeErrorIconCache();

    // Should not have fetched anything — restored from session storage
    expect(global.fetch).not.toHaveBeenCalled();
    // Cache should now reflect session values — verify by checking notification uses them
    // (indirect: getBrowserTheme + notifyUser check, but direct is simpler)
    // We can verify by calling notifyUser with error and checking the icon path
    getBrowserTheme.mockResolvedValue('light');
    chrome.notifications.create.mockResolvedValue('id');
    await notifyUser({ status: 'error', statusText: 'test' });
    // light error icon available → should use error icon
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-light-error.png');
  });

  it('should save error icon availability to session storage after detection', async () => {
    // Session cache miss
    chrome.storage.session.get.mockResolvedValue({});
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true })   // light-error.png exists
      .mockResolvedValueOnce({ ok: false });  // dark-error.png does not exist

    await initializeErrorIconCache();

    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      errorIconsAvailable: { light: true, dark: false },
    });
  });

  it('should fall through to fetch when session storage is empty', async () => {
    chrome.storage.session.get.mockResolvedValue({});
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    await initializeErrorIconCache();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should fall through to fetch when session data is malformed', async () => {
    // e.g. partial or null object
    chrome.storage.session.get.mockResolvedValue({ errorIconsAvailable: { light: true } });
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    await initializeErrorIconCache();

    // Partial data — should re-fetch
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
```

**Step 5: Run the new tests to confirm they fail**

```
npx vitest run --pool=threads tests/notification.test.js
```

Expected: the four new `initializeErrorIconCache` tests FAIL. All pre-existing tests pass.

---

## Task 4: Error icons — implement session storage in `notification.js`

**Files:**
- Modify: `src/background/modules/notification.js`

**Step 1: Update `initializeErrorIconCache()` to read from and write to session storage**

Replace the function body (lines 22–32):

```js
export async function initializeErrorIconCache() {
  // Try session storage first (persists across SW termination)
  if (chrome.storage?.session) {
    try {
      const stored = await chrome.storage.session.get('errorIconsAvailable');
      const s = stored.errorIconsAvailable;
      if (s && typeof s.light === 'boolean' && typeof s.dark === 'boolean') {
        errorIconsAvailable = s;
        return;
      }
    } catch (_e) {
      // Session storage unavailable — fall through to fetch
    }
  }

  // Full check via fetch (runs once per browser session when SW first cold-starts)
  for (const theme of ['light', 'dark']) {
    try {
      const response = await fetch(chrome.runtime.getURL(`/images/icon-128x128-${theme}-error.png`));
      errorIconsAvailable[theme] = response.ok;
    } catch (e) {
      errorIconsAvailable[theme] = false;
    }
  }

  // Persist result to session storage
  if (chrome.storage?.session) {
    chrome.storage.session
      .set({ errorIconsAvailable: { ...errorIconsAvailable } })
      .catch(() => {});
  }
}
```

**Step 2: Run the tests**

```
npx vitest run --pool=threads tests/notification.test.js
```

Expected: ALL tests pass, including the four new ones.

**Step 3: Run the full suite to check for regressions**

```
npx vitest run --pool=threads
```

Expected: 656+ tests pass, 0 failures.

**Step 4: Commit**

```bash
git add src/background/modules/notification.js tests/notification.test.js
git commit -m "perf: cache error icon availability in chrome.storage.session for SW cold-start recovery"
```

---

## Verification

After both tasks are committed, confirm the full picture:

```
npx vitest run --pool=threads
```

Expected output: all tests pass. Count should be ≥ 663 (656 prior + 3 theme tests + 4 icon tests).

**Manual smoke test in Chrome:**
1. Load the extension in developer mode (`chrome://extensions` → Load unpacked)
2. Open the popup once (warms the session cache)
3. Open `chrome://serviceworker-internals`, find the extension's SW, click **Stop**
4. Open the popup again — it should appear at the same speed as before (session cache restores theme + icons without offscreen roundtrip)
5. Open the browser's DevTools for the background page → Network tab — confirm no `fetch` calls to `-error.png` on the second popup open
