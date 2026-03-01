# Tech Stack Register

> Load when technical choices, tools, or constraints come up.
> Contains: languages, frameworks, tools, versions, constraints.

<!-- Format:
## [Layer/Domain]
- **[Tool/Language]**: [version if known] — [why chosen / constraints]
  - Added: YYYY-MM-DD
-->

## Extension
- **Manifest V3** Chrome Extension — service worker background, offscreen document, context menus
- **idb** v8 — IndexedDB wrapper (`openDB`, `put`, `delete`, `close`); two DBs: `Bookmarker` (v2) and `BookmarkerCache` (v3)
- **Vite** + `@crxjs/vite-plugin` — build tooling

## Testing
- **Vitest** v4 — test runner; config in `vite.config.js`
- **fake-indexeddb** — global IndexedDB shim in `tests/setup.js`
- **vi.mock('idb', ...)** — per-file override of idb with controlled mockDB
- Test command: `npm test` (runs `vitest run`); single file: `npx vitest run tests/foo.test.js`
- **WSL2 hang workaround**: vitest sometimes hangs on startup; retry without `--pool=vmThreads` or just run again ^tr-d5a7c3f162

## Testing Patterns
- **Async ordering test** — proves a function awaits a promise before returning:
  ```js
  let flag = false;
  mockDB.put.mockImplementation(
    () => new Promise(resolve => setTimeout(() => { flag = true; resolve(); }, 10))
  );
  await functionUnderTest();
  expect(flag).toBe(true); // false if fire-and-forget
  ```
  Added: 2026-02-23 ^tr-e2b8d4c037
