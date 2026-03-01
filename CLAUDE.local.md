# Working Memory

> This is your working memory. Auto-loaded every session via CLAUDE.local.md.
> ~1500 word limit. Only behavior-changing facts earn a place here.
> Last updated: 2026-03-01

## Active Context

**Current Focus**: Bookmarker-for-Nextcloud — warmup feature shipped; no active work
**Key Deadline**: [none]
**Blockers**: [none]

## Project State

- **Branch**: `main` (all work on main) ^tr-a3f8c2e914
- 2026-02-23: 16 commits — 4 DB write fixes + 15-commit perf pass + test suite overhaul
- 2026-02-24: +5 commits — vite config `assert`→`with`, rollup@4 explicit pin, session cache for SW cold-start (chrome.storage.session)
- 2026-02-24 evening: +6 commits — fixed all 4 code review bugs (items 2–5)
- 666 tests passing across 27 files (`npx vitest run --pool=threads`)
- SonarCloud: 308 issues total; 33 critical in `critical.md`; S4123 (10 issues) all false positives
- **WSL2 note**: Pre-warm disk cache before tests: `node --input-type=module --eval "import 'vitest'; import 'jsdom'; import 'vite'; console.log('all warmed')"`

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

---
*For detailed history, see memory/registers/*
*For daily logs, see memory/daily/*
