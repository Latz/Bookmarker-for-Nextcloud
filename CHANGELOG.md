# Changelog

## 0.32.0 — 2026-03-25

### Improvements

- **Better keyword extraction** — JSON-LD keyword extraction refactored into a dedicated helper with improved handling of `@graph` articles, comma-separated strings, `termCode` arrays, and `mainEntity.keywords`.
- **GitHub topic detection** — Improved GitHub topic tag selectors to match current and legacy GitHub DOM structures.
- **Request cancellation** — Opening the popup now cancels any still-running previous request for the same tab, preventing stale responses from overwriting fresh ones.
- **Pre-flight URL validation** — Non-bookmarkable URLs (`chrome://`, `chrome-extension://`, `about:`, `data:`, `blob:`, `javascript:`) are rejected immediately before any network call.
- **Request deduplication** — Duplicate in-flight requests for the same URL are deduplicated so the server is not hit twice.
- **Accessibility improvements** — Options page zen-mode controls now have `aria-label` attributes and proper `<label>` elements for screen reader compatibility.

### Fixes

- **SonarCloud S6582** — Replaced `!credentials || !credentials.server` with optional chaining `!credentials?.server` in `warmupConnection()`.

## 0.31.0 — 2026-03-24

### Major Improvements

- **Zen mode now works reliably** — The context menu click event was silently dropped on SW cold-starts because the `onClicked` listener was registered inside an async function after multiple awaits. Moved listener to top-level so Chrome delivers events reliably per MV3 spec.
- **Zen mode toggle in Options page** — Added "Enable Zen Mode" checkbox to the Zen tab so users can enable/disable zen mode directly from Options, without needing to right-click the extension icon.
- **SW connection warm-up** — On every service worker startup, a background `GET bookmark` request primes the TCP/TLS connection, auth header cache, and network timeout cache before the user opens the popup. Reduces popup latency on first interaction.
- **Session cache for SW cold-starts** — Browser theme and error icon availability are now persisted to `chrome.storage.session` so cold-starting service workers skip expensive offscreen roundtrips and fetch calls.

### Minor Improvements

- **`cbx_zenDisplayNotification` setting is now respected** — The "Show success notification in zen mode" option was saved to storage but never read. Zen mode now skips the success notification when the setting is off; errors always notify regardless.
- **Parallel credential and zen-mode checks in popup** — Credential lookup and zen-mode state read now run in parallel on popup open instead of sequentially.
- **Batch option fetching** — Multiple option reads consolidated into single `getOptions([...])` calls in `hydrateForm.js` and `getKeywords.js` to reduce IndexedDB round-trips.
- **DocumentFragment for folder rendering** — Folder list insertion uses `DocumentFragment` instead of `innerHTML` manipulation for better DOM performance.
- **Connection pool for IndexedDB** — Both the main Bookmarker DB and the cache DB use connection pools to avoid repeated open/close cycles.
- **Offscreen document readiness signal** — Replaced fixed 100 ms delays with a proper ready-signal handshake from the offscreen document.
- **Parallel offscreen setup and tab content fetch** — Offscreen document creation and tab content fetch now run concurrently.
- **Already-bookmarked check** — Extension checks the Nextcloud server on popup open and shows whether the current page is already bookmarked.

### Fixes

- **Zen mode popup flash** — `window.close()` was called before `chrome.runtime.sendMessage()` in the popup's zenMode function. The popup page context was destroyed before the message fired, so the bookmark was never saved. Fixed order.
- **URL field invisible on first install** — Storage default used `cbx_showURL` but `hydrateForm` read `cbx_showUrl` (case mismatch). URL field now shows correctly after a fresh install.
- **Keyword search depth slider broken** — Storage key was `input_headlinesDepth` but `getKeywords` read `input_headings_slider`. Renamed to match; slider value now reaches keyword extraction.
- **`clearData()` crash** — Invalid `createObjectStore` calls inside `clearData()` caused a `TypeError`. Removed the invalid calls.
- **HTTP errors silently swallowed in `apiCall.js`** — Variable shadowing caused HTTP error responses to return `{}` instead of `{ status: 'error', statusText }`. Errors now propagate correctly to `notifyUser`.
- **Bookmark check result cached when server unreachable** — A failed server check (network error) was cached as "not bookmarked", causing the extension to stop checking on subsequent opens. Failed checks are no longer cached.
- **`cbx_zenDisplayNotification` write unreliable** — `store_data` calls in the context menu click handler were fire-and-forget without `.catch`. Added `.catch(() => {})` for robustness.
- **`setZenModeMenu` try/catch** — Added error handling so `contextMenus.update` calls in `setZenModeMenu` don't throw when the menu item doesn't exist yet during a cold SW start.
