# Preferences Register

> Load when task involves user style, code conventions, or workflow.
> Contains: code style, communication preferences, workflow habits.

<!-- Format:
## [Category]
- [Preference]: [detail]
  - Source: [how we learned this] — YYYY-MM-DD
-->

## Development Environment — WSL2

- **Pre-warm disk cache before running vitest**: Run `node --input-type=module --eval "import 'vitest'; import 'jsdom'; import 'vite'; console.log('all warmed')"` before `npx vitest run` when node_modules is on a Windows NTFS drive (D:). Cold NTFS cache via WSL2 causes jsdom to take >60s to load, exceeding vitest's hardcoded worker startup timeout. ^tr-e3a9f7b2c1
  - Source: Discovered during vite 7 upgrade attempt — 2026-02-24
