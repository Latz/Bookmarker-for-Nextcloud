# Fix Slider Key Mismatch Design

## Problem

The headlines-depth slider saves its value under `input_headings_slider` (matching the HTML element ID), but the storage default and `getKeywords.js` consumer both use `input_headlinesDepth`. The slider setting is therefore never read by keyword extraction — it always falls back to the default of 3.

## Approach

Rename `input_headlinesDepth` → `input_headings_slider` in storage defaults and `getKeywords.js`. The HTML element and `options.js` already use `input_headings_slider` correctly, so no changes are needed there.

## Files to modify

- `src/lib/storage.js` — rename key in default-value initializer
- `src/background/modules/getKeywords.js` — rename key in `getOptions()` call and options read
- `tests/getKeywords.test.js` — rename key in all mock option objects (15 occurrences)

## Testing

No new tests needed. The existing getKeywords tests cover the `maxLevel` path; they just need the key renamed to match the fixed implementation.
