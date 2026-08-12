# Performance Review — Bookmarker for Nextcloud

**Version reviewed:** 0.32.0 (branch `css-refactor`, commit `b60cc33`)
**Date:** 2026-08-12

---

## 1. Scope & method

**Reviewed:**

- All 25 JS source files under `src/` (~4,000 LOC)
- Build configuration: `vite.config.js`, `tailwind.config.js`, `package.json`, `manifest.json`
- Generated stylesheets: `src/popup/css/popup.css`, `src/options/options.css`
- Shipped artifact: `bookmarker-for-nextcloud-0.32.0.zip` (621 KB, 54 files) and the local `dist/`

**Not covered:**

- No runtime profiling was performed — there is no live Nextcloud instance available in this environment. All timing claims below are structural (bytes moved, round trips taken, algorithmic complexity), not measured wall-clock.
- No cross-browser behaviour (Vivaldi, Edge) was verified.

**Prior context:** three optimisation passes already landed (2026-02-23 perf pass, 2026-02-24 session cache, 2026-03-01 SW warm-up). Those tuned *within* the existing architecture. Most of what follows is architectural or was missed by those passes — see §5 for what is already working well, including one prior optimisation that turns out to be inert.

---

## 2. The critical path

What happens between the user clicking the toolbar icon and seeing a filled-in form:

| # | Step | Where | Cost |
|---|------|-------|------|
| 1 | Chrome opens `popup.html`, blocks on two stylesheets | `popup.html:9-10` | **84 KB** render-blocking CSS (`popup.css` 71 KB + `tagify.css` 13 KB) |
| 2 | `popup.js` module graph loads | `popup.js:1-5` | Tagify (**78 KB**) + textfit pulled in eagerly |
| 3 | Script waits for `readyState === 'complete'` | `popup.js:8` | **Everything below is blocked until all of the above finishes** |
| 4 | Read `appPassword` + `cbx_enableZen` | `popup.js:11-14` | IndexedDB open (popup context, cold) + 2 gets — correctly parallelised |
| 5 | `createForm()` | `hydrateForm.js:62` | One batched `getOptions` of 5 keys |
| 6 | `sendMessage({msg:'getData'})` → SW | `popup.js:48` | SW may be cold-starting here |
| 7 | SW: query active tab, inject content script | `getData.js:58,167` | Returns **entire page HTML** to the SW |
| 8 | SW: ensure offscreen doc, forward HTML to it | `getData.js:93,114` | HTML structured-cloned a **second** time |
| 9 | Offscreen: `DOMParser` + extract | `offscreen.js:29-91` | Extracts all inline script sources + all h1–h6; cloned back — **third** copy |
| 10 | Parallel: description, keywords, bookmark check, folders | `getData.js:127-133` | Correctly parallelised; keyword/folder fetch may hit the network |
| 11 | `hydrateForm()` → `fillKeywords` | `hydrateForm.js:97` | `cacheGet('keywords')` — another IndexedDB round, possibly a network fetch; then Tagify instantiation |

Steps 7–9 dominate on content-heavy pages, and step 3 needlessly serialises steps 1–2 in front of steps 6–10 — the only part that touches the network.

---

## 3. P0 findings — popup critical path

### P0-1. The page HTML crosses process boundaries three times

`src/background/modules/getData.js:165-174`

```js
const injectionResults = await chrome.scripting.executeScript({
  target: { tabId },
  func: () => document.documentElement.innerHTML,
});
return injectionResults[0].result;
```

That string is the **complete serialised DOM** of the active tab — commonly 500 KB to several MB on news sites, social feeds, or documentation portals. It is then handed to the offscreen document (`getBrowserTheme.js:199-208`), which structured-clones it again.

The response is not small either. `offscreen.js:53`:

```js
scripts: Array.from(doc.querySelectorAll('script')).map(script => script.text),
```

Every inline script's full source is copied into the response object and cloned back to the SW — on an ad-heavy page that alone can exceed the original HTML. `offscreen.js:76-83` unconditionally extracts h1 through h6 even though `input_headings_slider` defaults to 3 and `cbx_extendedKeywords` is often off.

Structured cloning is synchronous on both sides and scales linearly with payload size. Three passes over multiple megabytes, per popup open.

**Fix direction:** move extraction into the injected function so it runs against the live DOM in the tab and returns only the small `parsedData` object. The offscreen document is then needed only for `matchMedia` theme detection, not `DOM_PARSER`. Independently: `scripts` feeds a single `script.includes('dataLayer.push')` test (`getKeywords.js:229`) — pre-filter to matching scripts before serialising. Extract only the heading levels actually requested.

**Expected win:** the largest single win available. Eliminates two full-payload clones and the offscreen HTML-parse hop entirely.

---

### P0-2. The network round trip waits for the stylesheet

`src/popup/popup.js:8-9`

```js
document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
```

`complete` fires only after every subresource — including the 71 KB stylesheet and 78 KB of Tagify — has loaded and been parsed. The `getData` message (step 6), which triggers script injection, HTML parsing, *and* an HTTP call to the Nextcloud server, cannot start until then. These are entirely independent: nothing about the SW round trip needs the DOM.

**Fix direction:** fire `chrome.runtime.sendMessage({ msg: 'getData' })` at module top level, store the promise, and `await` it after the form is built. The credential check (`load_data('credentials','appPassword')`) can start early too. This overlaps the slowest link with the render work instead of queueing behind it.

**Expected win:** shaves roughly the full CSS+JS load time off perceived latency — the two costs run concurrently instead of back to back.

---

### P0-3. The popup ships the options page's stylesheet

`tailwind.config.js`

```js
content: ['./src/popup/**/*.{html,js}', './src/options/**/*.{html,js}'],
```

Both `build:css:popup` and `build:css:options` load this same config via `@config`, so both outputs are generated against the union of both pages' markup. The result: `popup.css` is 71,462 bytes and `options.css` is 70,633 bytes — essentially the same file.

Verified by inspecting the generated CSS: `popup.css` contains rules for `.tab`, `.tab-content`, `.menu`, `.menu-dropdown-toggle`, and `.diff` — daisyUI components that appear only in `options.html`. The `@layer utilities` block alone is 60 KB of the 71 KB.

The popup's actual markup (`popup.html` plus the classes assigned in `hydrateForm.js`, `popup.js`) uses roughly 15 distinct classes: `btn`, `btn-info`, `input`, `input-bordered`, `input-info`, `input-sm`, `textarea` variants, `select` variants, `loader`, `parent`/`div1`/`div2`/`div3`, plus a handful of flex and text utilities.

**Fix direction:** give each entry point its own content glob — either two config files, or Tailwind 4's `@source` directive inside each `input.css` scoped to that page's directory. Also consider daisyUI 5's component `exclude` list.

**Expected win:** an estimated ~50 KB off a render-blocking stylesheet, on a 350 px popup that is expected to paint instantly.

---

## 4. P1 findings — wasted work and dead optimisations

### P1-4. `warmupConnection()` has never run — **bug, not just slowness**

`src/background/background.js:178-185`

```js
const credentials = await load_data('credentials', 'server');
if (!credentials?.server) return;
```

`load_data` unwraps single-item requests (`storage.js:87-90`):

```js
// if there's only 1 item in the object return the value instead of the object
if (Object.keys(result).length === 1) {
  return result[Object.keys(result)[0]];
}
```

So `credentials` is the server URL **string**, and `credentials.server` is always `undefined`. The guard always returns early. The entire SW connection warm-up shipped on 2026-03-01 — TCP/TLS priming, auth-header cache, network-timeout cache — has never executed in production.

Note that the 2026-03-22 SonarCloud S6582 fix rewrote this exact line (`!credentials || !credentials.server` → `!credentials?.server`). It changed the null-check style but preserved the shape bug.

The tests do not catch it because they mock the wrong shape. `tests/background.test.js:499`:

```js
load_data.mockResolvedValueOnce({ server: 'https://nextcloud.example.com' });
```

The real `load_data('credentials', 'server')` returns `'https://nextcloud.example.com'` — a string, never `{ server: … }`. The mock asserts against a contract the implementation does not have, so the suite stays green while production always takes the early return.

**Fix:** `if (!credentials) return;` — `credentials` *is* the server. Then correct the three warm-up tests (`tests/background.test.js:496-530`) to mock `load_data`'s real single-item return shape, or the same class of bug can recur.

---

### P1-5. Tagify and textfit are eager in the popup bundle

`src/popup/modules/fillKeywords.js:3` — `import Tagify from '@yaireo/tagify'`
`src/popup/popup.js:5` — `import textFit from 'textfit'`

The built chunk `fillFolders-*.js` is **78 KB**, dominated by Tagify, plus `tagify.css` at 13 KB linked from `popup.html`. Tagify is only needed when `cbx_showKeywords` is enabled, and only after the form has painted. `textfit` is used in exactly one place — `popup.js:25`, the connection-error path — yet is parsed on every successful open.

**Fix direction:** `await import('@yaireo/tagify')` inside `fillKeywords` after the show-keywords check; `await import('textfit')` inside the error branch. Load `tagify.css` dynamically alongside, or fold its handful of needed rules into `popup.css`.

**Expected win:** ~78 KB of parse/compile off the default path.

---

### P1-6. Retry loop burns 2.5 s on non-bookmarkable pages

`src/popup/popup.js:46-65`

```js
for (let attempt = 0; attempt < retryCount; attempt++) {
  const data = await chrome.runtime.sendMessage({ msg: 'getData' });
  if (data.ok) return data;
  lastError = data;
  if (attempt < retryCount - 1) { /* ... */ await sleep(500); }
}
```

Every non-`ok` response is treated as retryable. But `getData.js:83-88` returns `{ ok: false, error: 'URL is not bookmarkable' }` for `chrome://`, `about:`, `data:`, and extension pages — a permanent condition. The default `input_numberOfRetries` is 5, so opening the popup on any such page costs 5 SW round trips and 4 × 500 ms of sleeping (~2.5 s) before showing an error it knew about immediately.

Each retry also re-runs the whole SW pipeline, including script injection.

**Fix direction:** have `getData` mark terminal failures (`retryable: false`) and break out of the loop on those.

---

### P1-7. `reduceKeywords` is O(words × tags) and re-normalises per call

`src/background/modules/getKeywords.js:48-52`

```js
const allKeywords = allKeywordsRaw.map((keyword) => keyword.toLowerCase());
let reducedKeywords = keywords.filter((keyword) =>
  allKeywords.includes(keyword.toLowerCase()),
);
```

`Array.prototype.includes` is a linear scan, executed once per candidate word. The lowercased array is rebuilt from scratch on every invocation.

This matters because of the caller. `getKeywords.js:393-408`:

```js
while (level <= maxLevel) {
  const headlines = document.querySelectorAll(`h${level}`);
  for (const headline of headlines) {
    const words = headline.innerText.split(/[\W_]+/g);
    const reducedKw = await reduceKeywords(words, true, allKeywords);
```

In extended-keyword mode, `reduceKeywords` runs once **per headline** across h1–h6 — sequentially awaited. For a user with 3,000 stored tags and a page with 80 headlines averaging 8 words, that is 80 rebuilds of a 3,000-element lowercased array plus ~1.9 M string comparisons, all on the SW's single thread, inside the popup's critical path.

Each call also re-reads `cbx_reduceKeywords` via `getOption` (`getKeywords.js:28`) — cache-backed, but still an async hop per headline.

**Fix direction:** build a lowercased `Set` once at the top of the extended-keywords block and pass it down; `Set.has()` makes each lookup O(1). Hoist the `cbx_reduceKeywords` read out of the loop.

**Expected win:** turns a quadratic hot spot into a linear one — orders of magnitude on large tag collections.

---

### P1-8. Folder sort comparator returns a boolean — **bug, not just slowness**

`src/background/modules/getFolders.js:34`

```js
folders.sort((a, b) => a.title.localeCompare(b.title, userLang) > 0);
```

`Array.prototype.sort` expects a negative / zero / positive number. This returns `true` or `false`, coerced to 1 or 0 — it can never express "a before b". The resulting order is engine-dependent and effectively unsorted, so the folder dropdown is not reliably alphabetical.

The performance angle: `localeCompare` allocates a collator on every comparison. For an *n*-node folder tree that is O(n log n) collator constructions, repeated at every level of the recursive `json2tree` walk.

**Fix:**

```js
const collator = new Intl.Collator(userLang);   // hoist out of json2tree
folders.sort((a, b) => collator.compare(a.title, b.title));
```

Fixes correctness and removes the per-comparison allocation in one change.

---

## 5. What is already working well

The prior optimisation passes left real infrastructure in place, and it should not be undone by any of the above:

- **Options cache** with per-key TTL and a batched `getOptions()` (`storage.js:203-243`) that issues parallel gets rather than sequential ones.
- **Connection pooling** for both IndexedDB databases (`storage.js:36-63`, `cache.js:103-150`), with an idle-close timer on the cache DB.
- **Request deduplication** for in-flight bookmark checks (`getData.js:19,257-307`) and offscreen document creation (`getBrowserTheme.js:20-73`).
- **Per-tab AbortControllers** so a popup re-open cancels the previous tab's outstanding request.
- **Session-storage caches** for `browserTheme` and `errorIconsAvailable` (`getBrowserTheme.js:88-98`, `notification.js:22-53`), which survive MV3 service-worker termination — a genuinely good fit for the ~30 s idle-kill behaviour.
- **LRU memoisation** in `stringSimilarity.js`, `urlNormalizer.js`, and `cache.js`'s `hashUrl`.
- **Parallel fan-out** in `getData.js:127-133` and `apiCall.js:62-65`.

The exception is the SW connection warm-up (P1-4), which is present in the source but inert.

---

## 6. P2 findings — smaller items

| # | Finding | Location |
|---|---------|----------|
| 9 | Unconditional `console.log` on every read and write. `load_data` logs its full result object; `store_data` logs every item. These fire in SW hot paths and serialise objects each time. Same pattern in `options.js` (`setOptions`, `saveZenTags`, checkbox handler) and `hydrateForm.js:37`. Everything else in the codebase uses the `log(DEBUG, …)` helper — these were missed. | `storage.js:92`, `storage.js:122` |
| 10 | `initDefaults()` issues 20 separate `store_data` calls — 20 IndexedDB transactions and 20 console logs where one batched call would do. Runs on fresh install and on "reset options". | `storage.js:332-359` |
| 11 | `checkBookmark` splits its option reads into two sequential `getOptions` calls. The split is deliberate (the cache check sits between them), but on a cold SW it costs two IndexedDB round trips for five booleans. Worth measuring whether one call is faster in the common cache-miss case. | `getData.js:232`, `getData.js:247` |
| 12 | `timeoutFetch` registers an `abort` listener on the caller's signal and never removes it, so listeners accumulate on a long-lived signal. `clearTimeout(id)` is not in a `finally`, so a rejected fetch leaves the abort timer armed. | `apiCall.js:44-52` |
| 13 | The message listener returns `true` unconditionally, holding the response channel open for fire-and-forget messages (`saveBookmark`, `zenMode`, `authorize`) that never call `sendResponse`. Only the `getData` case needs it. | `background.js:43` |
| 14 | A 60 s `setTimeout` cleans up AbortControllers, but an MV3 service worker is killed at ~30 s idle, so it usually never fires. Harmless in practice (the map dies with the worker) but the code implies a guarantee it does not provide. | `getData.js:76-80` |
| 15 | Asset weight in the 621 KB shipped zip: `background.webp` 101 KB (login page only), `icon-512x512-light.png` 50 KB, `logo.png` 34 KB, `favicon.ico` 14 KB. The 512 px icons are referenced by `chrome.action.setIcon` but Chrome only renders at 16/32/48 — the large variants are decoded for nothing. | `dist/assets/`, `dist/images/` |
| 16 | `vite.config.js` sets `sourcemap: true` and `dist/` accumulates ~350 KB of `.map` files. Verified they are **not** present in the 0.32.0 zip, so nothing ships today — but that exclusion is incidental to how the zip was made, not enforced by config. Worth pinning to `sourcemap: false` (or `'hidden'`) for the release build so it cannot regress. | `vite.config.js:35` |

---

## 7. Prioritised recommendations

| # | Change | Effort | Expected win |
|---|--------|--------|--------------|
| P0-1 | Extract in the injected content script; drop the offscreen HTML round trip | High | Largest available — removes MB-scale clones from every popup open |
| P0-2 | Start the `getData` round trip at module load, not on `readyState==='complete'` | Low | Overlaps the network with rendering; large perceived win for ~10 lines |
| P0-3 | Per-entry Tailwind content globs | Low | ~50 KB off render-blocking CSS |
| P1-4 | Fix the `warmupConnection` guard | Trivial | Activates an already-written optimisation |
| P1-5 | Dynamic-import Tagify and textfit | Low | ~78 KB off the default popup path |
| P1-7 | `Set`-based `reduceKeywords`, hoist the option read | Low | Removes a quadratic hot spot |
| P1-6 | Don't retry terminal errors | Low | −2.5 s on `chrome://` and extension pages |
| P1-8 | `Intl.Collator` for folder sorting | Trivial | Fixes ordering + removes per-comparison allocation |
| P2-9/10 | Route stray `console.log` through `log(DEBUG, …)`; batch `initDefaults` | Trivial | Small but free |
| P2-15/16 | Optimise images; pin `sourcemap: false` for release | Low | Smaller package, no accidental map leak |

Suggested sequencing: the four Trivial/Low items in the P1 block (4, 5, 6, 7, 8) are independent, individually testable, and together address most of the non-architectural waste. P0-2 and P0-3 are also low-effort and high-yield. P0-1 is the one that needs a design pass — it changes where parsing happens and touches `getKeywords`'s use of the raw `content` string for regex scanning (`getKeywords.js:306,327`), which would also need to move into the injected function.

---

## 8. How to measure

**Popup critical path.** Wrap the pipeline in `performance.mark` / `performance.measure`:

```js
performance.mark('popup-start');            // top of popup.js
performance.mark('form-created');           // after createForm()
performance.mark('data-received');          // after getDataWithRetry()
performance.mark('form-hydrated');          // after hydrateForm()
performance.measure('popup-total', 'popup-start', 'form-hydrated');
```

Read the entries from the popup's DevTools console (right-click the popup → Inspect). Capture a baseline on three page classes before changing anything: a light page, a heavy news page, and a `chrome://` page (for P1-6).

**Service worker.** `chrome://extensions` → Inspect the service worker → Performance tab. Record while opening the popup. Look specifically for long synchronous blocks around the `sendMessage` boundaries — that is the structured-clone cost from P0-1.

**Payload sizes.** For P0-1, log `content.length` in `getData.js` and `JSON.stringify(result).length` in `offscreen.js` before and after. That directly quantifies the bytes removed.

**Bundle and CSS.** `npm run build` then `ls -laS dist/assets` — compare `popup-*.css` and the Tagify chunk before and after P0-3 and P1-5.

**Algorithmic.** For P1-7, seed the keyword cache with a few thousand tags, enable `cbx_extendedKeywords`, and time `getKeywords` on a heading-dense page (a long documentation page works well).

**Regression safety.** The suite should stay green throughout. On WSL2, pre-warm the disk cache first:

```
node --input-type=module --eval "import 'vitest'; import 'jsdom'; import 'vite'; console.log('all warmed')"
npx vitest run --pool=threads
```

Note that P1-4's fix will likely require updating the warm-up tests, since they currently mock `load_data` with a return shape the real function does not produce.

---
---

# Second Pass — 2026-08-12

Written after the first pass was applied. Its purpose is to catch what the first
review missed, so it deliberately does **not** restate the original 16 findings.

## 8. Status of the first pass

15 of 16 findings applied across six commits. P0-1 deferred by decision.

| # | Finding | Status | Commit |
|---|---------|--------|--------|
| P0-1 | MB-scale HTML round trips | **deferred** | — |
| P0-2 | Popup gated on `readyState` | applied | `235dae9` |
| P0-3 | Per-entry Tailwind scoping | applied | `dfcd3c6` |
| P1-4 | `warmupConnection()` inert | applied | `01f8322` |
| P1-5 | Tagify/textfit eager | applied | `235dae9` |
| P1-6 | Retrying terminal errors | applied | `235dae9` |
| P1-7 | Quadratic `reduceKeywords` | applied | `49e31d3` |
| P1-8 | Folder sort comparator | applied | `01f8322` |
| P2-9 | Credential logging | applied | `79a99ba` |
| P2-10 | `initDefaults` batching | applied | `49e31d3` |
| P2-11 | Split `getOptions` | applied | `49e31d3` |
| P2-12 | `timeoutFetch` cleanup | applied | `49e31d3` |
| P2-13 | Message listener `return true` | applied | `49e31d3` |
| P2-14 | AbortController timer | no change needed (informational) | — |
| P2-15 | Image weight | partly superseded by **N3** below | — |
| P2-16 | Release sourcemaps | applied | `dfcd3c6` |

Measured outcomes:

| | before | after |
|---|---|---|
| Eager popup JS | ~103 KB | 25 KB |
| Popup CSS (`dist`) | 81 KB | 44 KB |
| **Eager popup payload** | **~165 KB** | **~69 KB** |
| Sourcemaps in `dist` | ~350 KB | 0 |
| Full test run | 540 s, 15 files never started | ~75 s, 26 files run |

## 9. What the first pass missed, and why

The first review traced the **popup** critical path in detail and treated the
**service worker's own startup** as a black box — `init()` was never examined.
That is where most of the findings below live, and in MV3 it matters more than
the framing implied: the worker is killed after ~30 s idle, so `init()` runs on
every cold start, plausibly more often than any single popup path.

Stating the blind spot explicitly so the reader can judge what else may be
unexamined: this pass covered SW startup, notification/icon handling, the
post-data popup render path, and dead code. It did **not** cover the options
page or login flow in depth, and still involved no runtime profiling.

## 10. New findings

### N1 — HIGH — `init()` is a fully sequential chain on every cold start

`src/background/background.js:117-172`

Five awaits in a row, each blocking the next:

```
await getBrowserTheme()           → offscreen round trip, or session cache
await chrome.action.setIcon()     → decodes 4 PNGs, incl. a 50 KB 512×512
await initializeErrorIconCache()  → 2 sequential fetches (see N2)
await getOption('cbx_enableZen')  → IndexedDB
    then contextMenus.removeAll() + 2 creates
    then warmupConnection()
```

Almost none of this is ordered by a real dependency. The icon work, the
error-icon cache and the zen option read are mutually independent; only
`setIcon` genuinely depends on `getBrowserTheme`, and only the context-menu
creation depends on the zen option. While `init()` grinds, the worker is busy
rather than answering the popup's `getData` message.

**Interaction with P1-4 worth noting:** `warmupConnection()` — which exists
purely to prime the connection *early* — fires **last**, behind everything
above. Now that it actually runs (it never did before `01f8322`), hoisting it
to the top of `init()` is probably the single highest-value line change
available here.

**Fix:** start `warmupConnection()` first, then `Promise.all` the independent
groups.

### N2 — MEDIUM — `initializeErrorIconCache` fetches sequentially

`src/background/modules/notification.js:38-45`

```js
for (const theme of ['light', 'dark']) {
  const response = await fetch(chrome.runtime.getURL(`/images/icon-128x128-${theme}-error.png`));
```

Two serial round trips where one `Promise.all` suffices. Runs on cold start
whenever the session cache is empty.

### N3 — MEDIUM — Oversized action icons, while correctly-sized ones sit unused

`src/background/background.js:122-129`

`setIcon` is given 64/128/256/512. Chrome renders the toolbar icon at 16 px
(32 px at 2× DPR), so it downsamples a **50 KB 512×512 PNG** on every cold
start — slower *and* visually worse than supplying the intended size.

`public/images/icon-16x16-light.png` (2.4 KB) and `icon-32x32-light.png`
(3.1 KB) **already exist in the repo** and are referenced by neither `setIcon`
nor `manifest.json`'s `icons`. This is a free win using assets already present,
and it supersedes most of P2-15.

### N4 — MEDIUM — Storage waterfall on the popup render path

`hydrateForm.js:65`, `hydrateForm.js:101`, `fillFolders.js:20`, `fillKeywords.js:17`

After the data arrives: `getOptions`(5) → `getOptions`(2) → `getOption('folderIDs')`
→ `cacheGet('keywords')`. The two `getOptions` are Map-cached and nearly free,
but `folderIDs` and the keyword list are separate reads on the render path, and
`cacheGet('keywords')` can escalate to a **network call** on a cold cache.

P0-2 now starts the `getData` round trip much earlier, which leaves that window
idle. These reads are prefetchable in parallel with it instead of serialised
behind it.

### N5 — LOW — `saveBookmarks.js` uses three `getOption` calls

`src/popup/modules/saveBookmarks.js:19-23`. Three separate reads where
`getOptions` (`storage.js:203`) does one batched fetch — the pattern the rest of
the codebase follows and that `49e31d3` applied elsewhere. Runs on every save.

### N6 — LOW — `getMeta` rescans the meta list per selector

`src/background/modules/getMeta.js:16`, filtering `getData.js:503`

Called with 7 selectors from `getDescription` and 9 from `getKeywords`. Each
call re-parses a selector string with a regex and linearly filters
`parsedData.metaTags` — up to 16 scans per page. Indexing the meta tags once by
`name`/`property` makes each lookup O(1). Bounded by page meta count, hence LOW.

### N7 — LOW — `spinner.js` is dead code

`src/background/modules/spinner.js` is imported by nothing (the only other
`spinner` reference in the tree is `login.css` pointing at `spinner.gif`). It
also carries a bug — `next()` increments `this.index`, then unconditionally
returns `this.elements[0]` — and an `intervalId` that is never used. Delete it.

### N8 — LOW — regression introduced by P0-2

`src/popup/popup.js:84`

P0-2 moved the `getData` dispatch to module load, but `getDataWithRetry` still
does `await getOption('input_numberOfRetries')` **before** its first
`sendMessage`. A storage read therefore sits in front of the round trip the
change exists to start early.

Recorded as a defect in the applied work, not a pre-existing miss. Fix by
fetching the retry count in parallel with the first attempt.

## 11. Correction to the first pass

**`performance.md`'s P0-3 fix sketch was wrong.** It proposed per-entry
`tailwind.config.js` files with narrowed `content` globs. Tailwind 4 **ignores
the legacy `content` key** and scans automatically, so that approach is a no-op
— when tried, the generated CSS grew by ~640 bytes and the options-only daisyUI
components were still present in `popup.css`.

The working fix, in `dfcd3c6`, is `@import "tailwindcss" source(none)` plus an
explicit `@source` per entry point. Anyone reading section 3 in isolation would
otherwise repeat the mistake.

## 12. Remaining work, in priority order

1. **P0-1** — in-page extraction, eliminating the MB-scale HTML clones. Still
   the largest single item in the codebase, and it also resolves **S5** in
   `security.md` (whole-DOM capture). Deferred by decision, not by analysis.
2. **N1** — parallelise `init()`; hoist `warmupConnection()` to the front.
3. **N3** — use the 16/32 px icons that already exist.
4. **N2**, **N4** — parallelise the two remaining serial groups.
5. **N5**–**N8** — small, independent, individually trivial.

Also still open from `security.md`, and cheap: **S2** is closed (`79a99ba`), but
**S1** (folder-title HTML injection) and **S3** (parameter injection on save)
remain. S3 in particular overlaps N5 — both are in `saveBookmarks.js` and would
naturally be fixed in one pass.
