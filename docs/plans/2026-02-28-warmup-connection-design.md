# Design: Connection Warm-Up on SW Startup

**Date:** 2026-02-28
**Branch:** warmup

## Problem

MV3 service workers terminate after ~30 seconds of idle. Every cold restart incurs:
- TCP + TLS handshake latency to the Nextcloud server
- Re-authentication (reading credentials from IndexedDB, re-generating the `Authorization` header)
- Network timeout option read from storage

This latency is paid when the user opens the popup, visible as a slow bookmark check or folder load.

## Solution

On every SW startup (and therefore also on first install), fire a lightweight API call to retrieve one bookmark from the server. This warms:
- TCP/TLS connection
- `cachedAuthHeader` in `apiCall.js` (avoids credential read on the real request)
- `cachedNetworkTimeout` in `apiCall.js`

## Design

### Trigger

Add `warmupConnection()` (fire-and-forget, no `await`) near the end of the existing `init()` function in `background.js`. `init()` already runs at module load time — i.e. on every SW wakeup — so no new event listeners are needed. This covers:
- Every cold restart after idle termination
- First install (the SW starts immediately after installation)

### API Call

```
GET index.php/apps/bookmarks/public/rest/v2/bookmark?page=0&limit=1
```

One bookmark, default sort (`lastmodified`). The Nextcloud Bookmarks API has no random sort parameter, so the most recent bookmark is an equivalent substitute for the connection warm-up purpose.

### Error Handling

Errors are silently swallowed. If credentials are not yet configured (brand-new install), `apiCall` returns `{status: 'error'}` gracefully. No UI impact.

### Guard Condition

Check if a server URL is configured before making the call. If not set, skip silently. This avoids a pointless failing request on a brand-new unconfigured extension install.

## Files Changed

- `src/background/background.js` — add `warmupConnection()` function and call it in `init()`

## Alternatives Considered

- **`chrome.runtime.onStartup` listener** — fires only when the browser starts, not on SW idle restarts. Misses the primary MV3 cold-restart scenario.
- **`chrome.runtime.onInstalled` + `init()`** — redundant; `init()` already runs at install time.
