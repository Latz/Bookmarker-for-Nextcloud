# SonarCloud S6582 — Optional Chain Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the redundant null-guard + property-access pattern on line 170 of `background.js` with a single optional chain expression to satisfy SonarCloud rule `javascript:S6582`.

**Architecture:** One-line change in `warmupConnection()`. The logic is identical: `!credentials || !credentials.server` ↔ `!credentials?.server`. No new tests needed — existing tests already cover both the null-credentials and no-server cases.

**Tech Stack:** Vanilla JS (ES2020+), Vitest test suite

---

## Issue Details

- **SonarCloud key:** `AZym1tSLsZaVqOVfjlgy`
- **Rule:** `javascript:S6582` — prefer optional chain over `&&`/`||` null-guard chains
- **File:** `src/background/background.js:170`
- **Current code:** `if (!credentials || !credentials.server) return;`
- **Fixed code:** `if (!credentials?.server) return;`

---

## File Map

| Action | Path |
|--------|------|
| Modify | `src/background/background.js:170` |
| Verify | `tests/background.test.js` (no changes needed) |

---

### Task 1: Apply the optional chain fix

**Files:**
- Modify: `src/background/background.js:170`

- [ ] **Step 1: Verify the current line**

  Read `src/background/background.js` lines 168–175 and confirm line 170 reads:
  ```js
  if (!credentials || !credentials.server) return;
  ```

- [ ] **Step 2: Apply the fix**

  Replace line 170 with:
  ```js
  if (!credentials?.server) return;
  ```

  The full `warmupConnection` function should now look like:
  ```js
  async function warmupConnection() {
    const credentials = await load_data('credentials', 'server');
    if (!credentials?.server) return;

    const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
    const data = new URLSearchParams({ page: 0, limit: 1 }).toString();
    await apiCall(endpoint, 'GET', data);
  }
  ```

- [ ] **Step 3: Run the warmupConnection tests to confirm nothing broke**

  ```bash
  npx vitest run --pool=threads tests/background.test.js
  ```

  Expected: all tests pass (look for the 3 `warmupConnection` describe-block tests in particular).

- [ ] **Step 4: Run the full test suite**

  ```bash
  npx vitest run --pool=threads
  ```

  Expected: 666 tests passing, 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/background/background.js
  git commit -m "fix: use optional chain in warmupConnection (S6582)"
  ```
