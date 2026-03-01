# Fix Unawaited DB Writes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Await all IndexedDB write operations before closing the connection, preventing race conditions that silently drop data.

**Architecture:** Four functions fire-and-forget their `db.put()` / `db.delete()` calls and then immediately call `db.close()`. The fix is minimal: collect promises, `await Promise.all(promises)` (or a single `await db.put()`), then close. No new abstractions needed.

**Tech Stack:** Vitest, `vi.fn()`, `vi.mock('idb')`, `fake-indexeddb` (already configured in `tests/setup.js`).

---

## Background

The following code paths close the IndexedDB connection before the write operation resolves:

| File | Function | Line | Bug |
|------|----------|------|-----|
| `src/lib/storage.js` | `store_data` | 100 | `db.put(...)` not awaited in loop |
| `src/lib/storage.js` | `delete_data` | 127–130 | `db.delete(...).catch(...)` not awaited in loop |
| `src/lib/storage.js` | `store_hash` | 147 | `db.put(...)` not awaited |
| `src/lib/cache.js` | `cacheTempAdd` | 95 | `db.put(...)` not awaited |

**Test strategy:** Replace the default `vi.fn()` mock (which returns `undefined`) with a delayed Promise that sets a flag when resolved. If the function under test awaits the write, the flag is `true` when the function returns. If not, it's `false`.

---

## Task 1: Fix `store_data` — await writes before close

**Files:**
- Modify: `tests/storage.test.js` (add test inside existing `describe('store_data')`)
- Modify: `src/lib/storage.js:98-103`

---

### Step 1: Write the failing test

Open `tests/storage.test.js`. Inside the `describe('store_data', () => {` block (around line 210, after the last `it`), add:

```js
it('should await db.put before calling db.close', async () => {
  let putResolved = false;
  mockDB.put.mockImplementation(
    () => new Promise(resolve => setTimeout(() => { putResolved = true; resolve(); }, 10))
  );

  await store_data('options', { cbx_enableZen: true });

  expect(putResolved).toBe(true);
  expect(mockDB.close).toHaveBeenCalled();
});
```

### Step 2: Run the test — expect it to FAIL

```bash
npm test -- tests/storage.test.js
```

Expected output: `FAIL` — `expect(putResolved).toBe(true)` receives `false` because the current code calls `db.close()` before the put resolves.

### Step 3: Fix `store_data` in `src/lib/storage.js`

Replace lines 98–103 (the loop + close):

```js
// BEFORE:
  for (let item of items) {
    for (let key in item) {
      db.put(storeName, { item: key, value: item[key] });
    }
  }
  db.close();
```

```js
// AFTER:
  const puts = [];
  for (let item of items) {
    for (let key in item) {
      puts.push(db.put(storeName, { item: key, value: item[key] }));
    }
  }
  await Promise.all(puts);
  db.close();
```

### Step 4: Run the tests — expect them to PASS

```bash
npm test -- tests/storage.test.js
```

Expected: All `store_data` tests pass, including the new one.

### Step 5: Commit

```bash
git add tests/storage.test.js src/lib/storage.js
git commit -m "fix: await Promise.all(puts) before db.close() in store_data"
```

---

## Task 2: Fix `delete_data` — await deletes before close

**Files:**
- Modify: `tests/storage.test.js` (add test inside existing `describe('delete_data')`)
- Modify: `src/lib/storage.js:126-131`

---

### Step 1: Write the failing test

Inside `describe('delete_data', () => {` (around line 241, after the last `it`), add:

```js
it('should await db.delete before calling db.close', async () => {
  let deleteResolved = false;
  mockDB.delete.mockImplementation(
    () => new Promise(resolve => setTimeout(() => { deleteResolved = true; resolve(); }, 10))
  );

  await delete_data('credentials', 'appPassword');

  expect(deleteResolved).toBe(true);
  expect(mockDB.close).toHaveBeenCalled();
});
```

### Step 2: Run the test — expect it to FAIL

```bash
npm test -- tests/storage.test.js
```

Expected: `FAIL` — `deleteResolved` is `false` because `db.close()` is called before the delete resolves.

### Step 3: Fix `delete_data` in `src/lib/storage.js`

Replace lines 126–131 (the loop + close):

```js
// BEFORE:
  for (let item of items) {
    db.delete(storeName, item).catch(() => {
      return;
    });
  }
  db.close();
```

```js
// AFTER:
  const deletes = [];
  for (let item of items) {
    deletes.push(db.delete(storeName, item).catch(() => {}));
  }
  await Promise.all(deletes);
  db.close();
```

### Step 4: Run the tests — expect them to PASS

```bash
npm test -- tests/storage.test.js
```

Expected: All `delete_data` tests pass, including the new one.

### Step 5: Commit

```bash
git add tests/storage.test.js src/lib/storage.js
git commit -m "fix: await Promise.all(deletes) before db.close() in delete_data"
```

---

## Task 3: Fix `store_hash` — await write before close

**Files:**
- Modify: `tests/storage.test.js` (add test inside existing `describe('store_hash')`)
- Modify: `src/lib/storage.js:147-148`

---

### Step 1: Write the failing test

Inside `describe('store_hash', () => {` (around line 258, after the last `it`), add:

```js
it('should await db.put before calling db.close', async () => {
  let putResolved = false;
  mockDB.put.mockImplementation(
    () => new Promise(resolve => setTimeout(() => { putResolved = true; resolve(); }, 10))
  );

  await store_hash('test-hash');

  expect(putResolved).toBe(true);
  expect(mockDB.close).toHaveBeenCalled();
});
```

### Step 2: Run the test — expect it to FAIL

```bash
npm test -- tests/storage.test.js
```

Expected: `FAIL` — `putResolved` is `false`.

### Step 3: Fix `store_hash` in `src/lib/storage.js`

Replace lines 147–148:

```js
// BEFORE:
  db.put('hashes', { item: hash, value: new Date().getTime() });
  db.close();
```

```js
// AFTER:
  await db.put('hashes', { item: hash, value: new Date().getTime() });
  db.close();
```

### Step 4: Run the tests — expect them to PASS

```bash
npm test -- tests/storage.test.js
```

Expected: All `store_hash` tests pass, including the new one.

### Step 5: Commit

```bash
git add tests/storage.test.js src/lib/storage.js
git commit -m "fix: await db.put before db.close() in store_hash"
```

---

## Task 4: Fix `cacheTempAdd` — await write

**Files:**
- Modify: `tests/cache.test.js` (add test inside existing `describe('cacheTempAdd')`)
- Modify: `src/lib/cache.js:95`

---

### Step 1: Write the failing test

Open `tests/cache.test.js`. Inside `describe('cacheTempAdd', () => {` (around line 210, after the last `it`), add:

```js
it('should await db.put to complete before returning', async () => {
  const existingTags = ['tag1', 'tag2'];
  let putResolved = false;

  mockDB.get.mockResolvedValue({ item: 'keywords', value: existingTags });
  mockDB.put.mockImplementation(
    () => new Promise(resolve => setTimeout(() => { putResolved = true; resolve(); }, 10))
  );

  await cacheTempAdd('keywords', ['tag3']);

  expect(putResolved).toBe(true);
});
```

### Step 2: Run the test — expect it to FAIL

```bash
npm test -- tests/cache.test.js
```

Expected: `FAIL` — `putResolved` is `false` because the put is not awaited.

### Step 3: Fix `cacheTempAdd` in `src/lib/cache.js`

Replace line 95:

```js
// BEFORE:
  db.put(type, { item: type, value: allTags.sort() });
```

```js
// AFTER:
  await db.put(type, { item: type, value: allTags.sort() });
```

### Step 4: Run the tests — expect them to PASS

```bash
npm test -- tests/cache.test.js
```

Expected: All `cacheTempAdd` tests pass, including the new one.

### Step 5: Run the full suite to confirm nothing is broken

```bash
npm test
```

Expected: All tests pass.

### Step 6: Commit

```bash
git add tests/cache.test.js src/lib/cache.js
git commit -m "fix: await db.put in cacheTempAdd to prevent fire-and-forget write"
```

---

## Done

All four race conditions are fixed. Each write operation is now guaranteed to complete before the DB connection is closed (or the function returns). No data loss on close.
