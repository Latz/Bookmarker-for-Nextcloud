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
- 828 tests passing across 37 files (`npx vitest run --pool=threads`)
- **Keyword coverage tool**: `npm run check:hn -- [--url <u>] [--limit N] [--json f] [-v]` — runs real `src` extraction (storage/cache stubbed via `module.registerHooks`) on links from HN/lobsters/dev.to/algolia (`--source`) or any RSS/Atom `--feed` vs. an independent detector; exit 1 on `MISS-*`. getKeywords merges all sources, so `partial` points to a real gap.
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

**2026-09-28 (later)**: Merged keywords from *all* sources into Tagify (getKeywords no longer first-wins; `mergeKeywords` dedupes case-insensitively), JSON-LD fixes (all Article subtypes in `@graph`, first block with keywords wins), lone `article:tag` not split on spaces, `a[rel~="tag"]`/`a[rel~="category"]` so WordPress `rel="category tag"` links are found. Checker gained `--source hn|lobsters|devto|algolia`, `--feed`, `--pages`, `--exclude` (`tools/hn-keyword-check/sources.js`; feed parsing is regex-based because happy-dom's XML parser drops items). Pushed to main.

**2026-09-28 (evening)**: Verified checker results by hand against raw HTML (19-page sample identical; of 92 "empty" pages 13 had keywords both tools missed). Fixed: `extractGtmKeywords` no longer stops at the first unparsable `dataLayer.push` script (Ars Technica); brute-force search in `extractPageData` now handles quoted keys, JSON arrays and `|` (Guardian, Variety) and is only a *fallback* in `getKeywords` (used when no real source finds anything, else it adds config noise). Checker reference gained the same inline-script fallback plus non-counted `hint: tag links` (`/tag/x/`); tag links deliberately NOT used as extension keywords (navigation noise, e.g. Cloudflare blog).

**2026-09-28 (later still)**: Workflow change for the checker, per user request: added `--review` to `check.js` (forces full detail for every page in a batch, labels the status `guess:` instead of a verdict). `classify()`'s ok/MISS/partial is now explicitly a hint, not authoritative -- workflow is small batches (`--source X --limit 15 --exclude <prior>.json --review`), a human/Claude reads each block and, when unclear, fetches the real page to decide. User explicitly said not to use RSS/Atom feeds for finding new links (see memory/hn-checker-no-feeds.md) -- use --source crawlers only.

**2026-09-28 (final)**: Ran the `--review` workflow on a fresh 14-page batch (had to widen to `--pages 6` per source -- 577 unique URLs already covered this session). Manually verified all 14 against raw HTML; no extension bugs. Found a tool-only gap: `reference.js`'s tag-link hint regex missed `/tags/{id}/{slug}` (NPR's shape, numeric id segment) -- widened `TAG_LINK_PATH` to allow one numeric segment, 2 new tests. Does not add tag links as extension keywords (that stays deliberately out of scope, per [[hn-checker-no-feeds]]-adjacent decision).

**2026-09-28 (final, jsdom)**: Ran 3 more `--review` batches (42 pages hand-checked, no extension bugs) -- one real fix: `reference.js`'s `DESCRIPTION_METAS` was missing `name="og:description"` (non-standard but real, jimmyhmiller.com) and `http-equiv=description`, both of which `getDescription.js` already checks; added, mirrors the real code now. Bigger finding: happy-dom's HTML parser silently truncates the DOM on real-world malformed markup (domainnamewire.com -- lost 58/79 `<a>` elements after a stray `<meta ></span>`) instead of recovering like a real browser. Switched `tools/hn-keyword-check/{sources,check}.js` from happy-dom to jsdom (new devDep, `^30.1.1`; Node 25 triggers an EBADENGINE warning on install but works fine) per explicit user instruction ("correctness is more important than speed") -- jsdom recovers correctly on the same page. Scoped to the checker tool only; the project's `@vitest-environment happy-dom` test setup is untouched (small controlled fixtures, not wild external HTML -- no evidence of the same failure mode there). 833 tests still pass.

---
*For detailed history, see memory/registers/*
*For daily logs, see memory/daily/*
