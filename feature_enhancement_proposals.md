# Feature Enhancement Proposals — Bookmarker for Nextcloud
**Date:** 2026-02-23
**Branch:** optionsgui
**Based on:** code_review.md · performance_review.md · full codebase read

---

## Structure

Part 1 catalogues every idea by category with a one-line rationale.
Part 2 gives deep-dives on the highest-impact proposals.

**Effort key:** XS < 1 day · S 1–2 days · M 3–5 days · L 1–2 weeks · XL > 2 weeks

---

# Part 1 — Full Catalogue

## A. Duplicate & Bookmark Management

| # | Idea | Effort |
|---|------|--------|
| A1 | **Duplicate strategy UI** — wire `select_duplicateStrategy` (already stored, no UI or logic) to let users choose: always update, always create new, always ask | S |
| A2 | **Conflict resolution dialog** — when a duplicate is found, show side-by-side diff of existing vs. incoming (title, tags, folders) before saving | M |
| A3 | **"View existing" quick link** — one-click button to open the existing Nextcloud bookmark in a new tab when duplicate is detected | XS |
| A4 | **Merge tags on update** — when updating a duplicate, merge tags from the page with existing tags instead of replacing | S |
| A5 | **Bulk save (all tabs)** — right-click the extension icon or use a context menu to save all open tabs in one action, with a summary of which were duplicates | L |

## B. Tag & Keyword Improvements

| # | Idea | Effort |
|---|------|--------|
| B1 | **Domain-based tag suggestions** — auto-suggest tags based on known domains (github.com → "code"; youtube.com → "video"; arxiv.org → "paper") via a configurable map | M |
| B2 | **Tag cleanup rules** — strip common prefixes/suffixes from extracted tags ("Category: ", "Tag: ", "Topic: ") and enforce max length, configurable in Options | S |
| B3 | **Negative tag filter** — a blocklist of words that should never be auto-added as tags (common words, branding, etc.) | XS |
| B4 | **Tag frequency sorting** — sort autocomplete dropdown by how often a tag has been used, not alphabetically | M |
| B5 | **Multi-word tag support** — preserve quoted strings as single tags when splitting comma-separated meta keywords | S |
| B6 | **Tag groups / namespaces** — display tags with a `prefix:` namespace visually grouped in the autocomplete (e.g., `lang:python`, `topic:ai`) | L |

## C. Folder Improvements

| # | Idea | Effort |
|---|------|--------|
| C1 | **Folder search box** — filter the folder list by typing; essential when the Nextcloud tree has 50+ folders | S |
| C2 | **Recently-used folders** — show the last 5 used folders at the top of the list, separated by a divider | S |
| C3 | **Folder favourites / pinning** — let users star specific folders to always show at the top | M |
| C4 | **New folder creation** — create a folder directly from the popup without opening Nextcloud | M |
| C5 | **Per-domain default folder** — automatically pre-select a folder based on the current URL's domain (e.g., github.com → /Code/GitHub) | M |

## D. Zen Mode Enhancements

| # | Idea | Effort |
|---|------|--------|
| D1 | **Multiple Zen profiles** — define named presets (e.g., "Read Later", "Work", "Research"), each with its own folder set and tags; choose active profile in Options | M |
| D2 | **Per-domain Zen trigger** — automatically activate Zen Mode for whitelisted domains (no popup at all) | M |
| D3 | **Keyboard shortcut for Zen** — trigger Zen save without opening the popup (requires `commands` permission) | S |
| D4 | **Zen save confirmation badge** — show a brief green ✓ badge on the toolbar icon for 2 s after a silent Zen save, instead of (or in addition to) a system notification | XS |
| D5 | **Undo last Zen save** — show a transient notification with an "Undo" button that deletes the just-saved bookmark | S |

## E. URL Privacy & Cleanup

| # | Idea | Effort |
|---|------|--------|
| E1 | **Tracking parameter stripping** — remove `utm_*`, `fbclid`, `gclid`, `ref`, `source`, `mc_*` and similar query params before saving; toggle in Options | S |
| E2 | **Canonical URL preference** — use `<link rel="canonical">` URL when available, falling back to browser URL | XS |
| E3 | **Affiliate / redirect unwrapping** — detect common redirect chains (t.co, bit.ly, etc.) and resolve to the final URL before saving | M |
| E4 | **URL preview / edit before save** — show the final URL that will be saved (after normalization + tracking strip) so the user can verify or edit it | XS |

## F. Offline & Reliability

| # | Idea | Effort |
|---|------|--------|
| F1 | **Offline bookmark queue** — when Nextcloud is unreachable, queue the save locally and sync automatically when connectivity is restored | L |
| F2 | **Retry indicator in popup** — when `getDataWithRetry` is retrying, show progress visually (current already has this partially) and a Cancel button | XS |
| F3 | **Connection status indicator** — show a subtle green/amber/red dot in the popup header reflecting Nextcloud reachability | S |
| F4 | **Save confirmation receipt** — store the last-saved bookmark in `misc` store and show a brief "Saved to /Folder" message with a link | S |

## G. UI & UX

| # | Idea | Effort |
|---|------|--------|
| G1 | **Dark mode for popup & options** — the icon adapts to browser theme already; extend the same logic to the popup/options CSS with Tailwind's `dark:` utilities | S |
| G2 | **Keyboard navigation** — Tab through form fields; Enter to save; Escape to close; arrow keys in folder list | S |
| G3 | **Favicon in popup header** — show the current page's favicon next to the title for quick orientation | XS |
| G4 | **Character count for description** — show remaining characters if Nextcloud enforces a limit | XS |
| G5 | **Resizable popup** — remember popup dimensions between sessions (chrome.storage) | S |
| G6 | **Drag-to-reorder selected folders** — multi-selected folders can be reordered to reflect personal priority | L |
| G7 | **Undo last manual save** — same as D5 but for full-popup saves | S |
| G8 | **Options page search** — filter the options page by keyword when it grows long | M |

## H. Context Menu Extensions

| # | Idea | Effort |
|---|------|--------|
| H1 | **Right-click selected text → save as quote** — save the page with highlighted text pre-filled in the description field | S |
| H2 | **Right-click link → save link target** — save the href of a hovered link, not the current page | S |
| H3 | **Right-click image → save image page** — save the page with the image URL noted in description | S |

## I. Integrations

| # | Idea | Effort |
|---|------|--------|
| I1 | **Archive.org on save** — optionally POST the URL to Wayback Machine when bookmarking; adds archival timestamp to description | S |
| I2 | **RSS/Atom feed detection** — if the page declares a feed via `<link rel="alternate">`, offer to save the feed URL alongside the page URL | S |
| I3 | **Nextcloud Notes clip** — save a page clip (title + description + URL) as a Nextcloud Note in addition to or instead of a bookmark | L |
| I4 | **Share to Nextcloud Talk** — send the bookmark URL to a Talk conversation via Nextcloud's API | L |
| I5 | **Firefox / Edge compatibility** — the extension uses MV3 patterns that are largely compatible; a `browser.*` polyfill shim would enable publishing to Firefox AMO | M |

## J. Developer Experience & Quality

| # | Idea | Effort |
|---|------|--------|
| J1 | **Test coverage for `storage.js`** — the most critical module has zero tests; the unawaited-write bugs were found manually | M |
| J2 | **Test coverage for `apiCall.js`** — variable shadowing bug (code_review #2) would be caught by HTTP-error test cases | S |
| J3 | **Test coverage for `getData.js`** — integration tests for the full `checkBookmark` pipeline | M |
| J4 | **Automated version sync** — a pre-commit hook or build script that fails if `manifest.json` and `package.json` versions diverge | XS |
| J5 | **Error telemetry (opt-in)** — structured error logging to help diagnose field failures without compromising privacy | L |
| J6 | **Options export / import** — export all settings as JSON for backup or cross-device transfer | S |
| J7 | **`performance.mark` instrumentation** — as suggested in performance_review.md, add timing marks to measure popup critical path | S |

---

# Part 2 — Deep Dives

The following five are selected for highest user impact, feasibility, and distinctiveness.
They are ordered from easiest to most complex.

---

## Deep Dive 1 — Tracking Parameter Stripping (E1)

### Problem

Every URL saved today includes whatever tracking garbage is on the query string:
`https://example.com/article?utm_source=twitter&utm_campaign=spring24&fbclid=abc123`

This pollutes the saved URL, breaks deduplication (same article from different campaigns
looks like different URLs), and exposes how the user arrived at a page.

### Proposed Behaviour

Before saving — and before the duplicate URL check — strip a configurable set of query
parameters from the URL. The cleaned URL is shown in the URL input field so the user
can see and optionally revert the change.

**Default strip list (covers ~95% of tracking params):**
```
utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id,
fbclid, gclid, dclid, msclkid, mc_cid, mc_eid,
ref, referrer, source, origin, via, from,
_ga, _gl, _hsenc, _hsmi, mkt_tok, yclid
```

User can add/remove entries in Options → Advanced.

### Implementation Sketch

The strip happens in **`getData.js`** right after the tab URL is read, before
`normalizeUrl` and before `checkBookmark`:

```js
// getData.js (new step, ~10 lines)
const cleanedUrl = stripTrackingParams(data.url, trackedParamList);
data.url = cleanedUrl;
```

`stripTrackingParams` lives in `urlNormalizer.js` alongside `normalizeUrl`. It uses
`URLSearchParams` to delete matching keys and rebuilds the URL. The cleaned URL is what
gets saved to Nextcloud and shown to the user.

A new option `cbx_stripTrackingParams` (default `true`) and
`input_trackingParamList` (default list as textarea in Options) control the feature.

### Edge Cases
- Pages that use tracking params as functional state (rare but exists) → user can revert
  in the URL field
- The strip must happen before caching, otherwise `https://x.com/a?utm_a=1` and
  `https://x.com/a?utm_a=2` would cache independently

### Effort: S (1–2 days)

---

## Deep Dive 2 — Duplicate Strategy UI (A1)

### Problem

`select_duplicateStrategy` is already stored as a default option (`'update_existing'`)
in `initDefaults()` but:
- It has no UI control in `options.html`
- Nothing in `getData.js` or `saveBookmarks.js` reads it
- The user cannot choose behaviour — the extension always silently updates

### Proposed Behaviour

**Three strategies, user-selectable in Options → Bookmarks:**

| Strategy | Behaviour |
|----------|-----------|
| `update_existing` | (current) Silently update title/tags/description of the existing bookmark |
| `create_new` | Always create a new bookmark, even for duplicate URLs |
| `ask` | Open the popup with a conflict banner showing old vs. new tags; user decides per-save |

The `ask` strategy is the most powerful: when a duplicate is found, the popup header
changes to amber with "Already saved — update or create new?" and two buttons replace
the single Save button.

### Implementation Sketch

**`getData.js`** already detects duplicates via `checkBookmark`. The result flows back
to the popup as `data.checkBookmark`. The popup already reads this to show the
"Already Bookmarked" message.

Changes needed:
1. **`options.html`** — add a `<select>` with the three options wired to
   `select_duplicateStrategy`
2. **`hydrateForm.js`** — when `data.found === true`, read `select_duplicateStrategy`
   and either: pre-select the existing bookmark's data (update), clear the form
   (create new), or show the ask UI
3. **`saveBookmarks.js`** — pass `bookmarkID` as `-1` when strategy is `create_new`
   regardless of whether a duplicate was found

No new API surface needed — `bookmarkID > 0` triggers PUT (update), `bookmarkID = -1`
triggers POST (new), which already exists in `background.js:saveBookmark`.

### Effort: S–M (2–3 days)

---

## Deep Dive 3 — Per-Domain Default Folder (C5)

### Problem

Power users who bookmark heavily have a mental model of "GitHub pages go to /Code,
news articles go to /Reading/News, YouTube goes to /Media". Today every save starts
with the last-used folder selected, which requires manual re-selection per domain.

### Proposed Behaviour

In Options → Folders, a table where users map domain patterns to folder IDs:

```
Domain pattern      → Default folder
github.com          → /Code/GitHub
*.youtube.com       → /Media/Video
news.ycombinator.com → /Reading/Dev
*.bbc.co.uk         → /Reading/News
```

Patterns support `*` wildcard prefix. When the popup opens for a URL matching a pattern,
the matching folder is pre-selected instead of the last-used folder. If multiple patterns
match, the most specific one wins (no wildcard beats wildcard).

The last-used folder preference still applies for URLs with no matching rule.

### Data Model

Stored as `{ input_domainFolderRules: [{ pattern: "github.com", folderIds: ["42"] }] }`
in the options store. The `folderIds` is an array to allow multi-folder selection.

### Implementation Sketch

1. **`initDefaults()`** — add `input_domainFolderRules: []`
2. **`options.html/js`** — dynamic table: add row (pattern + folder select + remove button);
   save on every change
3. **`getFolders.js`** or **`hydrateForm.js`** — after loading folders, call
   `matchDomainRules(url, rules)` which returns matching folder IDs or `null`;
   if matched, pre-select those folders in `fillFolders`
4. **`fillFolders.js`** — accept an optional `overrideFolderIDs` parameter; when present,
   use them instead of the stored `folderIDs`

The matching function iterates rules, converts `*` to a regex prefix, tests the hostname.
It's ~20 lines of pure JS, easily unit tested.

### Effort: M (3–4 days)

---

## Deep Dive 4 — Offline Bookmark Queue (F1)

### Problem

When Nextcloud is unreachable (server down, VPN disconnected, travelling), a save attempt
silently fails — the user gets an error notification but the bookmark is gone. There is
no way to retry without re-navigating to the page.

### Proposed Behaviour

When a save fails due to a network error (not an auth error):
1. The bookmark data is written to a `pending` store in IndexedDB
2. A badge shows a count of pending bookmarks on the toolbar icon
3. When Nextcloud becomes reachable again (detected by a periodic heartbeat or on next
   successful API call), the queue is flushed automatically
4. A notification confirms how many bookmarks were synced

The user can also see and manage the queue in Options → Pending.

### Architecture

**New store:** `pending` in the main `Bookmarker` DB. Each entry:
```js
{ item: uuid, url, title, description, tags, folders, timestamp, attempts }
```

**New module:** `src/background/modules/queue.js`
- `enqueueBookmark(data)` — writes to `pending` store
- `flushQueue()` — reads all pending, attempts each, removes on success, increments
  `attempts` on failure, gives up after 10 attempts
- `getQueueLength()` — returns count for badge

**Trigger for flush:**
- `chrome.alarms` API — a 5-minute recurring alarm registered in `init()` calls
  `flushQueue()`; this survives service worker restarts
- Also triggered after any successful API call (the connection is clearly up)

**Changes to `saveBookmark` in `background.js`:**
```js
const response = await apiCall(...);
if (response.status === -1) {           // network error
    await enqueueBookmark(data);
    chrome.action.setBadgeText({ text: '⏳' });
} else {
    notifyUser(response);
}
```

### Permissions Required
- `alarms` — for periodic flush; add to manifest

### Effort: L (1–1.5 weeks)

---

## Deep Dive 5 — Right-Click Selected Text → Save as Quote (H1)

### Problem

A common research workflow: read an article, select a key passage, want to save the
page with that passage as the description. Today this requires: open popup → manually
find the passage → copy → paste into description. Three extra steps.

### Proposed Behaviour

Select any text on a page, right-click, and see "Save to Nextcloud (with quote)" in the
context menu. The popup opens pre-filled with the selection as the description. The
user can edit before saving.

Or, with a Zen Mode profile configured, the save happens silently and the quote becomes
the bookmark description.

### Implementation Sketch

**`manifest.json`** — add `"selection"` to the `contextMenus` item's `contexts`:
```json
{ "id": "menuSaveWithQuote", "title": "Save to Nextcloud (with quote)",
  "contexts": ["selection"] }
```

**`background.js` → `contextMenus.onClicked`:**
```js
if (info.menuItemId === 'menuSaveWithQuote') {
    const selectedText = info.selectionText;
    // Store it briefly in chrome.storage.session (ephemeral)
    await chrome.storage.session.set({ pendingQuote: selectedText });
    // Open popup (or trigger Zen)
    chrome.action.openPopup();
}
```

**`popup.js`** — on load, check `chrome.storage.session.get('pendingQuote')`:
```js
const { pendingQuote } = await chrome.storage.session.get('pendingQuote');
if (pendingQuote) {
    // Pre-fill description after form is hydrated
    document.getElementById('description').value = `"${pendingQuote}"`;
    await chrome.storage.session.remove('pendingQuote');
}
```

**Notes:**
- `chrome.storage.session` is MV3's recommended ephemeral storage (no persistence after
  browser close); no additional permission needed
- `chrome.action.openPopup()` is available in Chrome 99+ but requires user gesture in
  some contexts; a fallback is to open a small dedicated page instead
- The selection text is passed via `info.selectionText` from the context menu event, so
  no content script injection is needed

### Effort: S (1–2 days)

---

## Summary Table

| # | Feature | Impact | Effort | Category |
|---|---------|--------|--------|----------|
| E1 | Tracking parameter stripping | High | S | Privacy |
| A1 | Duplicate strategy UI | High | S–M | Core |
| C5 | Per-domain default folder | High | M | Folders |
| F1 | Offline bookmark queue | High | L | Reliability |
| H1 | Right-click quote save | Medium | S | UX |
| C1 | Folder search box | High | S | Folders |
| C2 | Recently-used folders | Medium | S | Folders |
| D3 | Keyboard shortcut for Zen | Medium | S | Zen |
| B1 | Domain-based tag suggestions | Medium | M | Tags |
| D1 | Multiple Zen profiles | Medium | M | Zen |
| G1 | Dark mode popup/options | Medium | S | UI |
| G2 | Keyboard navigation | Medium | S | UI |
| I5 | Firefox / Edge port | Medium | M | Platform |
| J1–J3 | Test coverage gaps | High (technical) | M | Quality |
| J4 | Version sync check | Low | XS | Quality |
