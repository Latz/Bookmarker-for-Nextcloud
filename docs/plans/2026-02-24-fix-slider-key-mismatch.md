# Fix Slider Key Mismatch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the key mismatch so the headlines-depth slider value is actually read by keyword extraction instead of always defaulting to 3.

**Architecture:** Pure rename — `input_headlinesDepth` → `input_headings_slider` in storage defaults and `getKeywords.js`. TDD: update tests first so they fail (mock provides new key, code still reads old key), then fix the implementation. No logic changes.

**Tech Stack:** Vitest, Chrome Extension MV3, no new dependencies.

---

### Task 1: Update tests and implement fix

**Files:**
- Modify: `tests/getKeywords.test.js` — rename key in all mock option objects
- Modify: `src/background/modules/getKeywords.js:339,386` — rename key in getOptions call and options read
- Modify: `src/lib/storage.js:338` — rename key in default-value initializer

**Step 1: Rename key in tests**

In `tests/getKeywords.test.js`, replace ALL occurrences of `input_headlinesDepth` with `input_headings_slider` (15 occurrences — use a global find-and-replace):

```
input_headlinesDepth  →  input_headings_slider
```

Every mock options object that looks like this:
```js
input_headlinesDepth: 3,
```
becomes:
```js
input_headings_slider: 3,
```

**Step 2: Verify tests fail**

```
npx vitest run --pool=threads tests/getKeywords.test.js
```

Expected: multiple test failures. The mock now provides `input_headings_slider` but the code still reads `options.input_headlinesDepth` (undefined), so `maxLevel` is undefined and heading extraction breaks.

**Step 3: Fix `getKeywords.js`**

In `src/background/modules/getKeywords.js`, make two changes:

Change 1 — in the `getOptions` call (around line 339):
```js
// Before:
'input_headlinesDepth',

// After:
'input_headings_slider',
```

Change 2 — in the options read (around line 386):
```js
// Before:
const maxLevel = options.input_headlinesDepth;

// After:
const maxLevel = options.input_headings_slider;
```

**Step 4: Fix `storage.js` default**

In `src/lib/storage.js` (around line 338):
```js
// Before:
store_data('options', { input_headlinesDepth: 3 });

// After:
store_data('options', { input_headings_slider: 3 });
```

**Step 5: Run getKeywords tests**

```
npx vitest run --pool=threads tests/getKeywords.test.js
```

Expected: ALL tests pass.

**Step 6: Run full suite**

```
npx vitest run --pool=threads
```

Expected: all tests pass (WSL2 worker timeouts for 1 file are a known environment issue, not failures).

**Step 7: Commit**

```bash
git add src/lib/storage.js src/background/modules/getKeywords.js tests/getKeywords.test.js
git commit -m "fix: rename input_headlinesDepth to input_headings_slider so slider value is read by getKeywords (item 4)"
```
