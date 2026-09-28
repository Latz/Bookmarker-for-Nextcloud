# Preferences Register

> Load when task involves user style, code conventions, or workflow.
> Contains: code style, communication preferences, workflow habits.

<!-- Format:
## [Category]
- [Preference]: [detail]
  - Source: [how we learned this] — YYYY-MM-DD
-->

## Development Environment — Native Windows

- **No disk-cache pre-warm needed**: The project moved from WSL2 to native Windows (2026-09). The old jsdom warm-up (cold NTFS cache via WSL2 exceeding vitest's 60s worker startup timeout) no longer applies. ^tr-e3a9f7b2c1
  - Source: Superseded WSL2 note from vite 7 upgrade attempt — 2026-02-24
