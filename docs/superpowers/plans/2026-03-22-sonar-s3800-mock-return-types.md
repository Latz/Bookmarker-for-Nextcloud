# SonarCloud S3800 — Mock Return-Type Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 17 `mockImplementation` callbacks that return mixed types (string vs object, boolean vs number vs null) with `mockResolvedValueOnce` chains so each mock function always returns the same type, satisfying SonarCloud rule `javascript:S3800`.

**Architecture:** Pure test-file changes. The root cause is `load_data(store, key)` and `getOption(key)` are key-dispatched mocks whose callbacks return different types per branch. Replacing them with sequential `mockResolvedValueOnce` calls removes the mixed-type function entirely. No production code changes.

**Tech Stack:** Vitest (`vi.fn()`, `mockResolvedValueOnce`), JavaScript

---

## Background

`load_data` in production returns a single value when one key is requested (`'server'` → string) and an object when multiple keys are requested (`'loginname','appPassword'` → object). The test mocks replicate this with an `if (key === 'server')` branch, which Sonar flags as mixed-return-type.

Fix: use `mockResolvedValueOnce` chains — the first call gets the server string, the second gets the credentials object, matching the actual call order in `apiCall.js`:
```js
// In apiCall.js these two happen in this order:
// 1. load_data('credentials', 'server')         → string
// 2. load_data('credentials', 'loginname', 'appPassword') → object (via authentication())
```

Auth cache is cleared in `beforeEach` via `clearApiCallCache()`, so call order is stable per test.

**Exception — loginflow tests:** When `data.loginflow = true`, `needsAuth = false` so `authentication()` is never called. Only one `load_data` call happens (server). Use a single `mockResolvedValueOnce`.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `tests/apiCall.test.js` — 15 occurrences |
| Modify | `tests/cache.test.js` — 2 occurrences |

---

### Task 1: Fix `tests/apiCall.test.js` — 15 S3800 occurrences

**Files:**
- Modify: `tests/apiCall.test.js`

All 15 occurrences follow one of two patterns.

**Pattern A — standard (14 tests):** Both `load_data` calls happen.
```js
// BEFORE
load_data.mockImplementation((store, key) => {
  if (key === 'server') return 'https://example.com';
  return { loginname: 'testuser', appPassword: 'testpass' };
});

// AFTER
load_data
  .mockResolvedValueOnce('https://example.com')
  .mockResolvedValueOnce({ loginname: 'testuser', appPassword: 'testpass' });
```

**Pattern B — loginflow (1 test, line 228):** Only `load_data('credentials', 'server')` runs.
```js
// BEFORE
load_data.mockImplementation((store, key) => {
  if (key === 'server') return 'https://example.com';
  return { loginname: 'testuser', appPassword: 'testpass' };
});

// AFTER
load_data.mockResolvedValueOnce('https://example.com');
```

**Pattern C — auth test (line 392, different credentials):**
```js
// BEFORE
load_data.mockImplementation((store, key) => {
  if (key === 'server') return 'https://example.com';
  return { loginname: 'admin', appPassword: 'secret123' };
});

// AFTER
load_data
  .mockResolvedValueOnce('https://example.com')
  .mockResolvedValueOnce({ loginname: 'admin', appPassword: 'secret123' });
```

**Complete list of changes (line → pattern):**
- Line 51 → Pattern A
- Line 78 → Pattern A
- Line 99 → Pattern A
- Line 140 → Pattern A
- Line 163 → Pattern A
- Line 202 → Pattern A
- Line 228 → Pattern B (loginflow — only server call)
- Line 253 → Pattern A
- Line 271 → Pattern A
- Line 288 → Pattern A
- Line 305 → Pattern A
- Line 332 → Pattern A
- Line 352 → Pattern A
- Line 372 → Pattern A
- Line 392 → Pattern C (admin/secret123 credentials)

- [ ] **Step 1: Apply Pattern A replacements (lines 51, 78, 99, 140, 163, 202, 253, 271, 288, 305, 332, 352, 372)**

  For each of these lines, replace the 4-line `mockImplementation` block with the 3-line `mockResolvedValueOnce` chain. Use the Edit tool with the exact string.

  Example for line 51:
  ```
  old:
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'testuser', appPassword: 'testpass' };
      });

  new:
      load_data
        .mockResolvedValueOnce('https://example.com')
        .mockResolvedValueOnce({ loginname: 'testuser', appPassword: 'testpass' });
  ```

  Since 12 of the 13 Pattern A occurrences have identical text, use `replace_all: true` for the common block.

  **IMPORTANT:** The block at line 228 (loginflow) looks identical but must NOT get Pattern A — do Pattern B for it separately.

- [ ] **Step 2: Apply Pattern B replacement (line 228 — loginflow)**

  After the `replace_all` in Step 1, verify line 228 was NOT changed (it has the same text). If it was changed to Pattern A, revert it to Pattern B:
  ```js
  load_data.mockResolvedValueOnce('https://example.com');
  ```

  Context to identify it: the surrounding test is `'should not include Authorization header for loginflow requests'` and just below is `const data = { loginflow: true };`.

- [ ] **Step 3: Apply Pattern C replacement (line 392 — admin credentials)**

  ```
  old:
      load_data.mockImplementation((store, key) => {
        if (key === 'server') return 'https://example.com';
        return { loginname: 'admin', appPassword: 'secret123' };
      });

  new:
      load_data
        .mockResolvedValueOnce('https://example.com')
        .mockResolvedValueOnce({ loginname: 'admin', appPassword: 'secret123' });
  ```

- [ ] **Step 4: Run apiCall tests**

  ```bash
  npx vitest run --pool=threads tests/apiCall.test.js
  ```

  Expected: all tests pass (same count as before — currently around 50+ tests in this file).
  If any test fails, read the failure and restore the `mockImplementation` for that specific test while investigating.

- [ ] **Step 5: Commit**

  ```bash
  git add tests/apiCall.test.js
  git commit -m "fix: replace mixed-type mockImplementation with mockResolvedValueOnce in apiCall tests (S3800)"
  ```

---

### Task 2: Fix `tests/cache.test.js` — 2 S3800 occurrences

**Files:**
- Modify: `tests/cache.test.js`

Both occurrences are `getOption.mockImplementation` calls that return boolean, number, or null based on key. `getCachedBookmarkCheck` calls `getOption` twice in sequence: first `'cbx_cacheBookmarkChecks'`, then `'input_bookmarkCacheTTL'`.

**Line 265 fix:**
```js
// BEFORE
getOption.mockImplementation((key) => {
  if (key === 'cbx_cacheBookmarkChecks') return true;
  if (key === 'input_bookmarkCacheTTL') return 10; // 10 minutes
  return null;
});

// AFTER
getOption
  .mockResolvedValueOnce(true)  // 'cbx_cacheBookmarkChecks'
  .mockResolvedValueOnce(10);   // 'input_bookmarkCacheTTL'
```

**Line 296 fix:**
```js
// BEFORE
getOption.mockImplementation((key) => {
  if (key === 'cbx_cacheBookmarkChecks') return true;
  if (key === 'input_bookmarkCacheTTL') return 5; // 5 minutes TTL
  return null;
});

// AFTER
getOption
  .mockResolvedValueOnce(true)  // 'cbx_cacheBookmarkChecks'
  .mockResolvedValueOnce(5);    // 'input_bookmarkCacheTTL'
```

- [ ] **Step 1: Apply line 265 fix**

  Use Edit tool. The old block is exactly:
  ```
      getOption.mockImplementation((key) => {
        if (key === 'cbx_cacheBookmarkChecks') return true;
        if (key === 'input_bookmarkCacheTTL') return 10; // 10 minutes
        return null;
      });
  ```
  Replace with:
  ```
      getOption
        .mockResolvedValueOnce(true)  // 'cbx_cacheBookmarkChecks'
        .mockResolvedValueOnce(10);   // 'input_bookmarkCacheTTL'
  ```

- [ ] **Step 2: Apply line 296 fix**

  ```
  old:
      getOption.mockImplementation((key) => {
        if (key === 'cbx_cacheBookmarkChecks') return true;
        if (key === 'input_bookmarkCacheTTL') return 5; // 5 minutes TTL
        return null;
      });

  new:
      getOption
        .mockResolvedValueOnce(true)  // 'cbx_cacheBookmarkChecks'
        .mockResolvedValueOnce(5);    // 'input_bookmarkCacheTTL'
  ```

- [ ] **Step 3: Run cache tests**

  ```bash
  npx vitest run --pool=threads tests/cache.test.js
  ```

  Expected: all tests pass.

- [ ] **Step 4: Run full test suite**

  ```bash
  npx vitest run --pool=threads
  ```

  Expected: 667 tests passing, 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add tests/cache.test.js
  git commit -m "fix: replace mixed-type mockImplementation with mockResolvedValueOnce in cache tests (S3800)"
  ```
