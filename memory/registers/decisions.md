# Decisions Register

> Load when past choices are questioned or context is needed.
> Contains: decisions with rationale, alternatives considered, outcomes.

<!-- Format:
## [Decision Title] — YYYY-MM-DD
- **Decision**: ...
- **Rationale**: ...
- **Alternatives considered**: ...
- **Outcome**: ...
- **Status**: in-effect | superseded | revisited
-->

## Connection Pool Extended to Main Bookmarker DB — 2026-02-23 ^tr-a8f3c7e291
- **Decision**: All `load_data`/`store_data`/`delete_data`/`store_hash`/`getOptions` calls now use a shared `getMainDBConnection()` pool instead of `openDB()/close()` per call
- **Rationale**: ~10+ open/close cycles per popup open; `openDB` is an async IPC round-trip even when the DB is already open. BookmarkerCache already had a pool — extended the pattern.
- **Alternatives considered**: Keep per-call open/close (simpler but slow); use a transaction-scoped connection (more complex, less benefit)
- **Outcome**: Single persistent connection reused across popup lifetime for both Bookmarker and BookmarkerCache DBs
- **Status**: in-effect

## Offscreen Document Readiness Signal — 2026-02-23 ^tr-b5d2e9a416
- **Decision**: Replace fixed 100ms `setTimeout` delays with a `ready` message roundtrip to the offscreen document; parallelise `ensureOffscreenDocument()` with `getContent()` in getData()
- **Rationale**: Flat 100ms sleep was worst-case assumption. Offscreen doc responds in microseconds once created. Also: `ensureOffscreenDocument` and `executeScript` are independent — can run concurrently.
- **Alternatives considered**: Exponential backoff polling (more complex); keep sleep (simple but wastes 100ms+ on every parse)
- **Outcome**: offscreen.js now handles `{msg: 'ready'}` messages; cold-start parse path ~100ms faster; doc creation overlaps with tab script injection
- **Status**: in-effect

## Batch Option Fetching via getOptions() — 2026-02-23 ^tr-c3f7b1d824
- **Decision**: Use `getOptions([...])` instead of sequential `getOption()` calls wherever multiple options are needed together
- **Rationale**: Each `getOption()` was a separate IndexedDB lookup. `getOptions()` opens one connection and runs all reads in parallel via `Promise.all()`. Options cache (30s TTL) means most calls are free after first fetch.
- **Alternatives considered**: Fetch all options eagerly at startup (wastes reads on options never used); keep sequential calls (simple but slow on cold start)
- **Outcome**: hydrateForm.js 5→1 DB call; popup.js credential+zen parallelised; checkBookmark() stages 2+3 merged; ~300ms popup init speedup combined with other changes
- **Status**: in-effect

## DocumentFragment for Folder Option Rendering — 2026-02-23 ^tr-c1a9f6e3b2
- **Decision**: Replace `selectbox.innerHTML = folders` with `template.innerHTML = folders; selectbox.appendChild(template.content)` using a DocumentFragment
- **Rationale**: Setting `innerHTML` directly on a `<select>` causes the browser to re-parse and replace all child nodes, triggering reflow. DocumentFragment builds the DOM off-screen and appends atomically.
- **Alternatives considered**: Keep innerHTML (simpler); build options with `document.createElement` in a loop (verbose)
- **Outcome**: Cleaner DOM update in `fillFolders.js` and `hydrateForm.js`; mock DOM objects now need `createElement` and `appendChild` in tests
- **Status**: in-effect

## Error Icon Existence Check at Startup — 2026-02-23 ^tr-d8c4b7f2a5
- **Decision**: Check whether error icon files exist once at startup (`initializeErrorIconCache`) and cache the result, instead of `fetch()`-checking on every error notification
- **Rationale**: Previous code did `fetch(chrome.runtime.getURL(...))` on every error to see if the icon existed. This is a network-adjacent operation on every notification. Startup check runs once.
- **Alternatives considered**: Keep per-call fetch (simple, accurate); bundle the icon so it always exists (removes fallback need)
- **Outcome**: `notification.js` has `errorIconsAvailable` cache; `initializeErrorIconCache()` called from `background.js init()`; test isolation via `_resetErrorIconCacheForTesting()`
- **Status**: in-effect

## Keyword List Pre-fetch for Extended Mode — 2026-02-23 ^tr-e6d1c3b8f4
- **Decision**: Pre-fetch `cacheGet('keywords')` once before the extended-mode reduce loop, and pass it as `cachedAllKeywords` to all `reduceKeywords()` calls, instead of fetching inside each call
- **Rationale**: Extended mode calls `reduceKeywords()` multiple times (description + N headline levels). Without pre-fetch, each call re-fetched the full keyword list from IndexedDB.
- **Alternatives considered**: Keep per-call fetch (simpler, no API change needed); move cache into `reduceKeywords` itself (encapsulated but harder to test)
- **Outcome**: `getKeywords.js` extended mode fetches keyword list once; `reduceKeywords` gains optional `cachedAllKeywords` param
- **Status**: in-effect

## rollup@4 Pinned Explicitly as devDependency — 2026-02-24 ^tr-f4b1d6c8e9
- **Decision**: Add `"rollup": "^4.59.0"` to devDependencies in package.json
- **Rationale**: `@crxjs/vite-plugin` ships with rollup 2.x as a dependency. Without an explicit pin, npm hoists rollup 2.x to the root node_modules, which starves vitest (which needs rollup 4.x via vite) of the correct version, causing all test workers to fail immediately.
- **Alternatives considered**: Remove @crxjs (breaks extension build); downgrade vitest (wrong direction); rely on npm deduplication (unreliable)
- **Outcome**: `rollup@4.59.0` at root; @crxjs still works via its own copy of rollup 2.x; vitest resolves rollup 4 correctly
- **Status**: in-effect

## vite 7 + jsdom 28 Upgrade Deferred — 2026-02-24 ^tr-a2c5e8f3b7
- **Decision**: Stay on vite 6.4.1 + jsdom 27.4.0 for now
- **Rationale**: Attempted upgrade 2026-02-24. vite 7 builds the extension fine (42 modules, all output correct). jsdom 28 requires Node 20/22/24 (we're on 22 — OK). Root blocker: WSL2 cold disk cache causes jsdom module load to exceed vitest's hardcoded 60s worker startup timeout. This is an environment issue, not a real incompatibility.
- **Alternatives considered**: Move node_modules to Linux filesystem (effective but requires setup); tune vitest worker timeout (no config option); pre-warm cache (works but fragile across npm installs)
- **Revisit when**: node_modules on Linux FS, or vitest adds configurable worker timeout
- **Status**: deferred

## Session Cache for SW Cold-Start Recovery — 2026-02-24 ^tr-c4f8a2e6b5
- **Decision**: Cache `cachedTheme` (in `getBrowserTheme.js`) and `errorIconsAvailable` (in `notification.js`) in `chrome.storage.session`, which persists across MV3 service worker terminations but clears on browser close
- **Rationale**: SW cold starts reset all module-level state, re-running the expensive offscreen document roundtrip (theme detection) and two `fetch()` calls (error icon existence) on every popup open after ~30s idle. Session storage restores these in a single fast read.
- **Alternatives considered**: SW keep-alive via alarms/offscreen ping (Chrome discourages, wastes battery, unreliable); popup-side options cache in session storage (marginal gain, options already pooled)
- **Outcome**: `getBrowserTheme()` checks `chrome.storage.session.get('browserTheme')` before offscreen detection; `initializeErrorIconCache()` checks `chrome.storage.session.get('errorIconsAvailable')` before fetching. Both write back after full detection. 7 new tests added.
- **Status**: in-effect

## SW Connection Warm-Up on Startup — 2026-03-01 ^tr-c7e2f4a9b3
- **Decision**: Add `warmupConnection()` to `background.js`, called fire-and-forget at the end of `init()`. Makes a `GET bookmark?page=0&limit=1` to the Nextcloud API on every SW startup.
- **Rationale**: MV3 SWs terminate after ~30s idle. Cold restarts force re-negotiation of TCP/TLS, re-reading credentials from IndexedDB, and rebuilding the auth header. Running the warm-up while the user hasn't opened the popup yet lets these caches settle before they're needed.
- **Alternatives considered**: `chrome.runtime.onStartup` (fires only on browser start, misses idle-termination cold restarts); `chrome.runtime.onInstalled` + `init()` (redundant — `init()` already runs at install time).
- **Outcome**: `warmupConnection()` guarded by `credentials.server` check; errors silently swallowed via `.catch(() => {})`; primes `cachedAuthHeader` and `cachedNetworkTimeout` in `apiCall.js`. 3 new tests. Commits: ea78141, 73668c1.
- **Status**: in-effect

## apiCall data.host Branch Calls authentication() — 2026-03-23 ^tr-da259ac786
- **Decision**: Treat the `data.host` code path in `apiCall.js` as requiring a credentials mock in tests (unless `data.loginflow` is also set)
- **Rationale**: When `data.host` is provided, `server = data.host` (skips `load_data` for server), but `authentication()` is still called unless `data.loginflow` is truthy — which calls `load_data('credentials', 'loginname', 'appPassword')`. A test that omitted this mock was silently passing only because `vi.clearAllMocks()` does not reset `mockImplementation`, so the previous test's implementation bled through.
- **Alternatives considered**: Add `loginflow: true` to the test data (hides the real behavior; wrong); keep `mockImplementation` (masks the issue)
- **Outcome**: `data.host` test in `apiCall.test.js` now has one explicit `mockResolvedValueOnce` for credentials. Pattern: `data.host` → one credentials mock; `data.host + loginflow` → no mocks needed; standard path → server mock + credentials mock.
- **Status**: in-effect

## vi.clearAllMocks() Does Not Reset mockImplementation — 2026-03-23 ^tr-3b9de8d046
- **Decision**: Use `mockResolvedValueOnce` chains (not `mockImplementation`) for per-test mock setup in apiCall and cache tests
- **Rationale**: `vi.clearAllMocks()` in `beforeEach` clears call history and queued `mockResolvedValueOnce` values, but does NOT reset `mockImplementation`. Tests relying on a prior test's `mockImplementation` silently pass even without their own mock setup. Switching to `mockResolvedValueOnce` makes each test self-contained and exposes any missing mocks immediately.
- **Alternatives considered**: Use `vi.resetAllMocks()` instead of `vi.clearAllMocks()` (resets implementations too, but also resets spy return values which breaks other mocks); keep `mockImplementation` (masks implicit coupling)
- **Outcome**: All 17 S3800 SonarCloud issues resolved; tests are now explicitly self-contained per mock call.
- **Status**: in-effect (pattern to follow for future test mock setup)

## Test Isolation via _reset*ForTesting Exports — 2026-02-23 ^tr-b3d7e4f1c9
- **Decision**: Export `_reset*ForTesting()` functions from modules that hold module-level state, to allow test isolation without module re-imports
- **Rationale**: ES modules are singletons — `cachedTheme`, `mainDbConnection`, `errorIconsAvailable` persist across tests. `vi.resetModules()` is expensive and breaks import references. Explicit reset functions are lightweight and targeted.
- **Alternatives considered**: `vi.resetModules()` per test (slow, breaks imports); avoid module-level state (requires bigger refactor)
- **Outcome**: `getBrowserTheme.js` → `_resetCacheForTesting()`; `storage.js` → `_resetMainConnectionForTesting()`; `notification.js` → `_resetErrorIconCacheForTesting(cache)`; all called in `beforeEach` in respective test files
- **Status**: in-effect (pattern to follow for future modules with module-level state)
