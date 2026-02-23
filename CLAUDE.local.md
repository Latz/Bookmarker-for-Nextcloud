# Working Memory

> This is your working memory. Auto-loaded every session via CLAUDE.local.md.
> ~1500 word limit. Only behavior-changing facts earn a place here.
> Last updated: 2026-02-23

## Active Context

**Current Focus**: Bookmarker-for-Nextcloud — code review items 2–5 (bugs from review)
**Key Deadline**: [none]
**Blockers**: [none]

## Project State

- **Branch**: `main` (all work on main) ^tr-a3f8c2e914
- 2026-02-23: 16 commits — 4 DB write fixes + 15-commit perf pass + test suite overhaul
- 718 tests passing across 27 files (`npx vitest run --pool=threads`)
- SonarCloud: 308 issues total; 33 critical in `critical.md`; S4123 (10 issues) all false positives

## Critical Preferences

- [None captured yet]

## Key Decisions in Effect

- [None captured yet]

## People Context

- [None captured yet]

## Open Loops

- Code review items 2–5 still unfixed (see `open-loops.md` for details) ^tr-c9e4b2d781

## Session Continuity

**2026-02-23**: Three passes: (1) Fixed 4 unawaited DB writes. (2) 15-commit perf optimization — connection pools for both DBs, offscreen ready-signal, `getOptions()` batching, DocumentFragment folder render, parallel offscreen+content, theme caching, error-icon startup check, keyword pre-fetch. (3) Repaired 8 test files broken by perf changes — getOptions adapter, `_reset*ForTesting` exports, fake-timer leak prevention, DocumentFragment mock updates. All decisions in `registers/decisions.md`.

---
*For detailed history, see memory/registers/*
*For daily logs, see memory/daily/*
