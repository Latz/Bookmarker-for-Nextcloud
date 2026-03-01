# Fix cbx_showURL Case Mismatch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the storage default key so `cbx_showUrl` is written correctly and `hydrateForm` can read it on first install.

**Architecture:** Two-file fix — update the one test that asserts the buggy key first (TDD red), then fix the storage default (green). No logic changes.

**Tech Stack:** Vitest, Chrome Extension MV3, no new dependencies.

---

### Task 1: Fix the test, then fix the implementation

**Files:**
- Modify: `tests/storage.test.js:424` — fix the mock asserting the buggy key
- Modify: `src/lib/storage.js:331` — fix the default-value key

**Step 1: Fix the test**

In `tests/storage.test.js`, find this assertion (around line 423):

```js
expect(mockDB.put).toHaveBeenCalledWith('options', {
  item: 'cbx_showURL',
  value: true,
});
```

Change it to:

```js
expect(mockDB.put).toHaveBeenCalledWith('options', {
  item: 'cbx_showUrl',
  value: true,
});
```

**Step 2: Verify test fails**

```
npx vitest run --pool=threads tests/storage.test.js
```

Expected: 1 test fails — the assertion now expects `cbx_showUrl` but `storage.js` still writes `cbx_showURL`.

**Step 3: Fix `storage.js`**

In `src/lib/storage.js` (around line 331), find:

```js
store_data('options', { cbx_showURL: true });
```

Change it to:

```js
store_data('options', { cbx_showUrl: true });
```

**Step 4: Run storage tests**

```
npx vitest run --pool=threads tests/storage.test.js
```

Expected: ALL 34 tests pass.

**Step 5: Verify no other occurrences of old key remain in src/**

```
grep -r "cbx_showURL" /mnt/d/ChromeExtensions/Bookmarker-for-Nextcloud/src
```

Expected: no output.

**Step 6: Commit**

```bash
git add src/lib/storage.js tests/storage.test.js
git commit -m "fix: rename cbx_showURL to cbx_showUrl in storage default so hydrateForm can read it (item 5)"
```
