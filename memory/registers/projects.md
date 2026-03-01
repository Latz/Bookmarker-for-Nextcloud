# Projects Register

> Load when a project is discussed.
> Contains: state, goals, decisions, blockers, key files.

<!-- Format:
## [Project Name]
- **Status**: active | paused | complete
- **Goal**: ...
- **Current state**: ...
- **Key files**: ...
- **Blockers**: ...
- **Last updated**: YYYY-MM-DD
-->

## Bookmarker-for-Nextcloud
- **Status**: active
- **Goal**: Chrome Extension (MV3) for managing Nextcloud bookmarks
- **Branch**: `main` (all work on main)
- **Current state**: Performance-optimized. All code review items complete. 666 tests passing.
- **Key files**:
  - `src/lib/storage.js` — IndexedDB ops, options cache, connection pool
  - `src/lib/cache.js` — BookmarkerCache DB, tag/folder cache
  - `src/popup/popup.js` — main popup entry
  - `src/background/modules/getData.js` — bookmark check + fetch pipeline
  - `tests/storage.test.js`, `tests/cache.test.js` — main test files
- **Review artefacts** (gitignored): `code_review.md`, `performance_review.md`, `feature_enhancement_proposals.md`, `anything_else.md`
- **Plans**: `docs/plans/2026-02-23-fix-unawaited-db-writes.md` — completed
- **Last updated**: 2026-03-01 ^tr-b7d1f5a923

## Completed Milestones
- 2026-02-23: Fixed 4 unawaited DB writes — `store_data`, `delete_data`, `store_hash` (storage.js) and `cacheTempAdd` (cache.js). TDD: failing tests added first, then fixed. Commits: c1caecac → 56809a3 → ecee6ff → 71592c6 ^tr-f1a6e9c458
- 2026-02-23: 15-commit performance optimization pass — connection pools (both DBs), offscreen ready-signal, `getOptions()` batching, DocumentFragment folder render, parallel offscreen+content fetch, theme result caching, error icon startup check, keyword list pre-fetch. ~300ms+ popup speedup. Commits: 628dc11 → 9ea289a ^tr-f2a7b5c9e1
- 2026-02-23: Test suite overhaul — 8 test files repaired after perf optimizations broke mocks and assertions. 656 tests passing across 27 files (note: count corrected 2026-02-24). Key fixes: getOptions adapter, _reset*ForTesting exports, fake-timer leak prevention, DocumentFragment mock updates. Commit: 9ea289a ^tr-a4c8d2f7b6
- 2026-02-24: Dependency hygiene — safe package updates (tailwindcss, daisyui, vitest, tagify, prettier), rollup@4 explicit pin (fixes @crxjs hoisting issue), vite config `assert`→`with` for Node 22. All 656 tests still passing. Commit: 68ceadb ^tr-b8e2d4c7f1
- 2026-02-24: SW session cache — cached `cachedTheme` and `errorIconsAvailable` in `chrome.storage.session` so MV3 cold starts skip offscreen roundtrip + fetch calls. 7 new tests. 663 tests passing. Commits: b1597ca, 2f2e9dc ^tr-d3a9f2c845
- 2026-02-25: All 4 code review bugs fixed — (2) apiCall variable shadow swallowed HTTP errors; (3) clearData threw ReferenceError/TypeError from invalid createObjectStore calls; (4) slider key mismatch (input_headlinesDepth vs input_headings_slider) meant keyword depth setting was ignored; (5) cbx_showURL vs cbx_showUrl mismatch broke URL field default on first install. Commits: ac41130, 4304b20, acb062a, f3bdb3f ^tr-e7b4c1d692
- 2026-03-01: SW connection warm-up — `warmupConnection()` added to `background.js`, fires `GET bookmark?page=0&limit=1` fire-and-forget on every SW startup to prime TCP/TLS, auth header cache, and timeout cache before popup opens. 3 new tests, 666 total. Commits: ea78141, 73668c1 ^tr-a6d3f8c2e1
