# Open Loops Register

> Load every session — check for active follow-ups, deadlines, commitments.
> Contains: unresolved items, pending tasks, commitments made.

<!-- Format:
## [Item]
- **Type**: follow-up | deadline | commitment | question
- **Due**: YYYY-MM-DD or "when X happens"
- **Context**: ...
- **Status**: open | in-progress | blocked
- **Added**: YYYY-MM-DD
-->

## S4123 Audit — CLOSED ^tr-a5f2c8e1b7
- **Type**: follow-up
- **Due**: —
- **Context**: 10 SonarQube S4123 "unexpected await of non-Promise" issues. Manual audit 2026-02-23 confirmed ALL are false positives — `authentication()`, `reduceKeywords()`, `getCachedBookmarkCheck()` are all genuinely `async`. Stale scan; fresh re-scan will clear them.
- **Status**: closed
- **Added**: 2026-02-23 | **Resolved**: 2026-02-23

## Code Review — Items 2–5 — CLOSED ^tr-c9e4b2d781
- **Type**: follow-up
- **Due**: —
- **Context**: All items fixed 2026-02-25.
  - Item 2: Removed variable shadow in `apiCall.js` — HTTP errors now return `{ status: 'error', statusText }`. Commit: ac41130
  - Item 3: Removed invalid `createObjectStore` calls in `clearData()`. Commit: 4304b20
  - Item 4: Renamed `input_headlinesDepth` → `input_headings_slider` in storage + getKeywords. Commit: acb062a
  - Item 5: Renamed `cbx_showURL` → `cbx_showUrl` in storage default. Commit: f3bdb3f
- **Status**: closed
- **Added**: 2026-02-23 | **Resolved**: 2026-02-25
