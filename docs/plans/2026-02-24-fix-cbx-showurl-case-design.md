# Fix cbx_showURL Case Mismatch Design

## Problem

`storage.js` writes the default value under `cbx_showURL` (uppercase URL), but the HTML element ID, `hydrateForm.js`, and all tests use `cbx_showUrl` (lowercase l). On first install the default is written under the wrong key, so `hydrateForm` never reads it and the URL field defaults to hidden.

## Approach

Fix the one wrong line in `storage.js`: rename `cbx_showURL` → `cbx_showUrl`. Everything else is already correct. Also update the one occurrence in `tests/storage.test.js` that mirrors the buggy key.

## Files to modify

- `src/lib/storage.js:331` — fix default-value key
- `tests/storage.test.js` — fix the one mock that uses `cbx_showURL`
