# Fix apiCall Variable Shadowing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the variable shadowing bug in `apiCall.js` that causes HTTP errors (401, 500, etc.) to silently return `{}` instead of an error object, so `notifyUser` can show error notifications for server failures.

**Architecture:** Two-line fix in `src/lib/apiCall.js` — remove the inner `let result = {}` declaration that shadows the outer one, and change the HTTP error result format from `{ status: <number> }` to `{ status: 'error', statusText: <string> }` to match the format `notifyUser` already checks. One existing test that asserts the old broken behaviour must also be corrected.

**Tech Stack:** Vitest, Chrome Extension MV3, no new dependencies.

---

### Task 1: Write the failing test

**Files:**
- Modify: `tests/apiCall.test.js`

**Context:** There is already a test called `'should handle error response'` (around line 270) that explicitly asserts the *buggy* behaviour (`expect(result).toEqual({})`). We need to add a new test that asserts the *correct* behaviour BEFORE touching the implementation, so we can confirm it fails red first.

**Step 1: Add a new failing test inside `describe('apiCall', ...)`**

Open `tests/apiCall.test.js`. Find the end of `describe('apiCall', ...)` — just before `describe('authentication', ...)` — and add this test:

```js
it('should return error object for HTTP error responses (401, 500, etc.)', async () => {
  load_data.mockImplementation((store, key) => {
    if (key === 'server') return 'https://example.com';
    return { loginname: 'testuser', appPassword: 'testpass' };
  });
  getOption.mockResolvedValue(10);

  mockFetch.mockResolvedValue({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  });

  const result = await apiCall('test/endpoint', 'GET');

  expect(result).toEqual({ status: 'error', statusText: 'Unauthorized' });
});
```

**Step 2: Run the new test to confirm it fails**

```
npx vitest run --pool=threads tests/apiCall.test.js
```

Expected: the new test FAILS with something like:
```
AssertionError: expected {} to deeply equal { status: 'error', statusText: 'Unauthorized' }
```
All other tests pass.

---

### Task 2: Implement the fix, correct the outdated test, verify

**Files:**
- Modify: `src/lib/apiCall.js:119-148`
- Modify: `tests/apiCall.test.js` (update 1 existing test)

**Step 1: Remove the inner variable shadow in `apiCall.js`**

In `src/lib/apiCall.js`, find this block (lines 119–148):

```js
let result = {};
try {
  // NOTE: This duplicate declaration creates variable shadowing - it's a bug but kept for backward compatibility
  // The inner result is used for successful/error responses, outer result is used for catch block
  let result = {};
  // Perform the API call and handle the response
  const response = await timeoutFetch(url, fetchInfo);
  if (response.ok) {
    result = await response.json();
  } else {
    result = {
      status: response.status,
      statusText: response.statusText,
    };
    throw new Error(result.statusText);
  }
  // OPTIMIZATION: Removed unnecessary Promise.resolve
  return result;
} catch (error) {
  // Only handle TypeError (network errors), other errors return {} (outer result)
  if (error instanceof TypeError) {
    result = {
      status: -1,
      statusText: error.message,
    };
  }
}

// OPTIMIZATION: Removed unnecessary Promise.resolve
return result;
```

Replace it with:

```js
let result = {};
try {
  const response = await timeoutFetch(url, fetchInfo);
  if (response.ok) {
    result = await response.json();
  } else {
    result = {
      status: 'error',
      statusText: response.statusText,
    };
    throw new Error(result.statusText);
  }
  return result;
} catch (error) {
  if (error instanceof TypeError) {
    result = {
      status: -1,
      statusText: error.message,
    };
  }
}

return result;
```

Changes made:
1. Deleted the inner `let result = {};` and its comment (removes the shadow)
2. Changed `status: response.status` (numeric) to `status: 'error'` (string) so `notifyUser` can detect it

**Step 2: Update the existing test that asserts the old broken behaviour**

In `tests/apiCall.test.js`, find the test `'should handle error response'`:

```js
it('should handle error response', async () => {
  load_data.mockImplementation((store, key) => {
    if (key === 'server') return 'https://example.com';
    return { loginname: 'testuser', appPassword: 'testpass' };
  });
  getOption.mockResolvedValue(10);

  mockFetch.mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
  });

  // The code sets result with status/statusText, throws an Error,
  // but the catch block only handles TypeError, so it returns {}
  const result = await apiCall('test/endpoint', 'GET');
  expect(result).toEqual({});
});
```

Replace it with:

```js
it('should return error object for HTTP error responses', async () => {
  load_data.mockImplementation((store, key) => {
    if (key === 'server') return 'https://example.com';
    return { loginname: 'testuser', appPassword: 'testpass' };
  });
  getOption.mockResolvedValue(10);

  mockFetch.mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
  });

  const result = await apiCall('test/endpoint', 'GET');
  expect(result).toEqual({ status: 'error', statusText: 'Not Found' });
});
```

**Step 3: Run the full apiCall test suite**

```
npx vitest run --pool=threads tests/apiCall.test.js
```

Expected: ALL tests pass. Count should be the same as before (no net change — one test renamed/updated, one new test added, net +1).

**Step 4: Run the full suite to check for regressions**

```
npx vitest run --pool=threads
```

Expected: all tests pass (663+ tests, 0 failures — WSL2 worker timeouts are a known environment issue, not test failures).

**Step 5: Commit**

```bash
git add src/lib/apiCall.js tests/apiCall.test.js
git commit -m "fix: remove variable shadowing in apiCall.js so HTTP errors propagate to notifyUser"
```
