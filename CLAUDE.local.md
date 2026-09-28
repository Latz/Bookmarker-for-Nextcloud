# Working Memory

> This is your working memory. Auto-loaded every session via CLAUDE.local.md.
> ~1500 word limit. Only behavior-changing facts earn a place here.
> Last updated: 2026-09-28

## Active Context

**Current Focus**: Bookmarker-for-Nextcloud — HN keyword checker shipped; no active work
**Key Deadline**: [none]
**Blockers**: [none]

## Project State

- **Branch**: `main` (all work on main) ^tr-a3f8c2e914
- 2026-02-23: 16 commits — 4 DB write fixes + 15-commit perf pass + test suite overhaul
- 2026-02-24: +5 commits — vite config `assert`→`with`, rollup@4 explicit pin, session cache for SW cold-start (chrome.storage.session)
- 2026-02-24 evening: +6 commits — fixed all 4 code review bugs (items 2–5)
- 774 tests passing across 35 files (`npx vitest run --pool=threads`)
- **Keyword coverage tool**: `npm run check:hn -- [--url <u>] [--limit N] [--json f] [-v]` — runs real `src` extraction (storage/cache stubbed via `module.registerHooks`) on HN front-page links vs. an independent detector; exit 1 on `MISS-*`. `partial` is usually expected (getKeywords: first source wins).
- SonarCloud: 308 issues total; 33 critical in `critical.md`; S4123 (10 issues) all false positives
- **Environment**: Native Windows (no longer WSL2) — no disk-cache pre-warm needed. Suite uses `node` env by default, `happy-dom` per file via `// @vitest-environment happy-dom` (branch `happydom`, 2026-09-28). `isolate: false` breaks tests — keep isolation on.

## Critical Preferences

- [None captured yet]

## Key Decisions in Effect

- [None captured yet]

## People Context

- [None captured yet]

## Open Loops

- [none] ^tr-c9e4b2d781

## Session Continuity

**2026-02-23**: Three passes: (1) Fixed 4 unawaited DB writes. (2) 15-commit perf optimization — connection pools for both DBs, offscreen ready-signal, `getOptions()` batching, DocumentFragment folder render, parallel offscreen+content, theme caching, error-icon startup check, keyword pre-fetch. (3) Repaired 8 test files broken by perf changes — getOptions adapter, `_reset*ForTesting` exports, fake-timer leak prevention, DocumentFragment mock updates. All decisions in `registers/decisions.md`.

**2026-02-24 AM**: Dependency hygiene. Safe package updates (tailwindcss, daisyui, vitest, tagify, prettier). Fixed vite.config.js `assert`→`with` (Node 22). Added rollup@4 explicit devDep (prevents @crxjs hoisting rollup 2.x to root, which breaks vitest). Attempted vite 7 + jsdom 28 upgrade — deferred (WSL2 cold disk cache causes vitest worker timeout). All 656 tests passing.

**2026-02-24 PM**: Session cache for SW cold-start recovery. Identified `chrome.storage.session` as the remaining high-impact perf win — MV3 SWs terminate after ~30s idle, resetting all module-level caches. Cached `cachedTheme` and `errorIconsAvailable` in session storage so cold starts skip offscreen roundtrip + fetch calls. 7 new tests. All 663 passing. Decisions in `registers/decisions.md`.

**2026-02-24 evening**: Fixed all 4 code review bugs. (2) Removed variable shadow in `apiCall.js` — HTTP errors now return `{ status: 'error', statusText }` instead of `{}`. (3) Removed invalid `createObjectStore` calls in `clearData()` — no longer throws ReferenceError/TypeError. (4) Renamed `input_headlinesDepth` → `input_headings_slider` in storage + getKeywords — slider value now reaches keyword extraction. (5) Renamed `cbx_showURL` → `cbx_showUrl` in storage default — URL field visibility now works on first install.

**2026-03-01**: SW connection warm-up. Added `warmupConnection()` to `background.js` — fires `GET bookmark?page=0&limit=1` fire-and-forget at end of `init()`, guarded by server-configured check. Primes TCP/TLS, `cachedAuthHeader`, and `cachedNetworkTimeout` before user opens popup. 3 new tests (666 total). Pushed to main. Decision in `registers/decisions.md`.

**2026-03-22**: Fixed SonarCloud S6582 — replaced `!credentials || !credentials.server` with `!credentials?.server` in `warmupConnection()` (background.js:170). 667 tests passing. Pushed to main.

**2026-03-22**: Fixed all 17 SonarCloud S3800 issues — replaced mixed-type `mockImplementation` callbacks with `mockResolvedValueOnce` chains in `tests/apiCall.test.js` (15 occurrences) and `tests/cache.test.js` (2 occurrences). Key insight: `data.host` path still calls `authentication()` → needs a credentials mock. Pushed to main (commits 27c8d5d, 33fb41b).

**2026-09-28**: Added `tools/hn-keyword-check/` (commit 14e4401). First run found a real bug: a single meta keyword without dividers (e.g. `article:tag` = `self-hosting`) was dropped in `keywords/metaKeywords.js` — fixed + tests updated (64da78c; old test had pinned the bug). Pushed to main.

---
*For detailed history, see memory/registers/*
*For daily logs, see memory/daily/*
