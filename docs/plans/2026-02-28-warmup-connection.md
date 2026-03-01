# SW Connection Warm-Up Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On every service worker startup, fire a lightweight API call to warm TCP/TLS, auth cache, and timeout cache before the user opens the popup.

**Architecture:** Add `warmupConnection()` to `background.js`. Call it fire-and-forget at the end of `init()`. Guard: skip if no server URL is configured. Uses the existing `apiCall` and `load_data` imports — no new dependencies.

**Tech Stack:** Vitest (tests), Chrome MV3 service worker, Nextcloud Bookmarks REST API v2

---

### Task 1: Write the failing tests

**Files:**
- Modify: `tests/background.test.js`

Add a new `describe('warmupConnection')` block inside the existing `describe('background.js')`. Insert it after the `init function` block (around line 495, before `Context menu click handlers`).

**Step 1: Add the tests**

Add this block to `tests/background.test.js`, just before the `describe('Context menu click handlers'` describe block:

```js
describe('warmupConnection', () => {
  it('should call apiCall with bookmark endpoint when server is configured', async () => {
    const { load_data } = await import('../src/lib/storage.js');
    load_data.mockResolvedValueOnce({ server: 'https://nextcloud.example.com' });

    await import('../src/background/background.js');
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(apiCall).toHaveBeenCalledWith(
      'index.php/apps/bookmarks/public/rest/v2/bookmark',
      'GET',
      'page=0&limit=1',
    );
  });

  it('should not call apiCall when server is not configured', async () => {
    const { load_data } = await import('../src/lib/storage.js');
    load_data.mockResolvedValueOnce({});

    await import('../src/background/background.js');
    await new Promise(resolve => setTimeout(resolve, 100));

    // apiCall should not have been called (no server = skip warmup)
    expect(apiCall).not.toHaveBeenCalled();
  });

  it('should silently ignore errors from the API call', async () => {
    const { load_data } = await import('../src/lib/storage.js');
    load_data.mockResolvedValueOnce({ server: 'https://nextcloud.example.com' });
    apiCall.mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    await expect(import('../src/background/background.js')).resolves.not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 100));
  });
});
```

**Step 2: Run the new tests to verify they fail**

```bash
npx vitest run --pool=threads tests/background.test.js 2>&1 | tail -30
```

Expected: tests named `warmupConnection` FAIL because the function doesn't exist yet.

---

### Task 2: Implement `warmupConnection`

**Files:**
- Modify: `src/background/background.js`

**Step 1: Add the function**

Add `warmupConnection` at the bottom of `background.js`, before `insertTimeOutMessage`:

```js
/**
 * Warms up the connection to the Nextcloud server on SW startup.
 * Primes the TCP/TLS connection, auth header cache, and network timeout cache.
 * Fire-and-forget — errors are silently ignored.
 */
async function warmupConnection() {
  const credentials = await load_data('credentials', 'server');
  if (!credentials || !credentials.server) return;

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const data = new URLSearchParams({ page: 0, limit: 1 }).toString();
  await apiCall(endpoint, 'GET', data);
}
```

**Step 2: Call it fire-and-forget at the end of `init()`**

Inside `init()`, at the very end (after `chrome.contextMenus.onClicked.addListener`), add:

```js
  // Fire-and-forget: warm up TCP/TLS and auth cache on every SW startup
  warmupConnection().catch(() => {});
```

**Step 3: Run the tests**

```bash
npx vitest run --pool=threads tests/background.test.js 2>&1 | tail -30
```

Expected: all `warmupConnection` tests PASS. Verify no existing tests regressed.

**Step 4: Run the full suite**

```bash
npx vitest run --pool=threads 2>&1 | tail -10
```

Expected: 666 tests passing (663 existing + 3 new), 0 failures.

**Step 5: Commit**

```bash
git add src/background/background.js tests/background.test.js
git commit -m "feat: warm up Nextcloud connection on SW startup"
```

---

### Task 3: Finish the branch

Invoke the `superpowers:finishing-a-development-branch` skill.
