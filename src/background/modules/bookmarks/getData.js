// @ts-check
// Collects everything the popup (and zen mode) needs about the active tab:
//   - url and title from the tab itself
//   - description and keywords extracted from the page (extractPageData is
//     injected into the tab; getDescription/getKeywords work on its result)
//   - the user's folders
//   - whether the page is already bookmarked (checkBookmark: exact URL, plus
//     optionally similar URLs / similar titles, with caching)
// These steps are run in parallel wherever they do not depend on each other.
import getDescription from '../page/getDescription.js';
import getKeywords from '../page/getKeywords.js';
import { getFolders } from './getFolders.js';
import apiCall from '../../../lib/apiCall.js';
import { getOptions } from '../../../lib/storage.js';
import log from '../../../lib/log.js';
import { normalizeUrl } from '../../../lib/urlNormalizer.js';
import { getCachedBookmarkCheck, cacheBookmarkCheck } from '../../../lib/cache.js';
import { batchSimilarityCheck } from '../../../lib/stringSimilarity.js';
import { createMockDocument } from '../page/mockDocument.js';
import { extractPageData } from '../page/extractPageData.js';

const DEBUG = false;

// Request deduplication: prevent duplicate in-flight requests for the same URL
const inflightChecks = new Map();

// AbortControllers per tab: prevent concurrent requests for the same tab
const abortControllers = new Map();

// Cleanup old abort controllers after timeout
const ABORT_CONTROLLER_CLEANUP_MS = 60000; // 1 minute

/**
 * Pre-flight URL validation
 * Quick check to avoid processing invalid or non-bookmarkable URLs
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is valid and bookmarkable
 */
function isValidBookmarkableUrl(url) {
  if (!url) return false;

  // Quick rejection of non-bookmarkable protocols
  const nonBookmarkableProtocols = [
    'chrome://',
    'chrome-extension://',
    'chrome-error://',
    'chrome-untrusted://',
    'devtools://',
    'edge://',
    'view-source:',
    'about:',
    'data:',
    'blob:',
    'javascript:',
    'file:',
  ];

  // URL schemes are case-insensitive ("Chrome://...", "JavaScript:...").
  const lowerUrl = url.toLowerCase();
  for (const protocol of nonBookmarkableProtocols) {
    if (lowerUrl.startsWith(protocol)) return false;
  }

  return true;
}

/**
 * Gathers the bookmark data for the active tab.
 *
 * The result always has an `ok` flag. On failure it is `{ ok: false, error }`
 * (plus `retryable: false` if trying again cannot help). On success it holds
 * url, title, description, keywords, folders and `checkBookmark`; if the page
 * is already bookmarked, the stored bookmark's fields (id as `bookmarkID`,
 * tags as `keywords`, added, lastmodified, ...) replace the extracted ones,
 * otherwise `bookmarkID` is -1.
 *
 * @param {{skipFolders?: boolean, deferCheck?: boolean}} [options]
 *   `skipFolders`: leave the folder list out (`folders` is then []). For
 *   callers that never show it, such as zen mode: the list is a cache read at
 *   best and a server request once its 24h cache has expired.
 *   `deferCheck`: do not look the page up on the server. The result then holds
 *   the page data only, with `bookmarkID: -1` and `checkPending: true`; the
 *   popup asks for the lookup separately (getBookmarkStatus) so it can show the
 *   form without waiting for the server round trip.
 * @returns {Promise<Object>}
 */
export default async function getData(options) {
  const skipFolders = options?.skipFolders === true;
  const deferCheck = options?.deferCheck === true;
  let data = { ok: true };

  // Needed before extraction can run (bounds how many heading levels the
  // injected function walks). Started here, in parallel with the tab lookup
  // below, rather than serially in front of it.
  const headingLevelPromise = getOptions(['input_headings_slider']);

  // --- get active tab info first (fast operation)
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Empty result: no normal window is focused (e.g. a DevTools window).
  if (!activeTab) {
    return { ok: false, error: 'No active tab found' };
  }

  data.url = activeTab.url;
  data.title = activeTab.title;

  // Cancels any previous lookup for this tab (e.g. the popup was reopened
  // while the last one was still running). Without a lookup there is nothing
  // to cancel or to register.
  const tabId = activeTab.id;
  const abortController = deferCheck ? null : startTabRequest(tabId);

  // Pre-flight validation: check if URL is bookmarkable
  if (!isValidBookmarkableUrl(data.url)) {
    return {
      ok: false,
      error: 'URL is not bookmarkable',
      // Permanent: this URL will never become bookmarkable, so the popup
      // should surface the error immediately rather than retry.
      retryable: false,
    };
  }

  // The check needs only url/title, so its network round trip overlaps with
  // the page extraction below instead of queueing behind it. The no-op catch
  // prevents an unhandled rejection when we return early before awaiting it.
  const checkPromise = abortController
    ? checkBookmark(data.url, data.title, abortController.signal)
    : null;
  checkPromise?.catch(() => {});

  const { input_headings_slider: headingLevel = 3 } = await headingLevelPromise;

  // Extraction runs inside the injected function, against the live page --
  // only the small parsedData object below crosses back to the service
  // worker, never the page's full HTML (previously ~1-5 MB, shipped once to
  // the SW and again to an offscreen document for DOMParser extraction).
  let parsedData;
  try {
    parsedData = await getContent(tabId, headingLevel);
  } catch (error) {
    data = {
      ok: false,
      error: error.message,
      // Script injection was refused (restricted page, missing host access).
      // That will not change between attempts.
      retryable: false,
    };
  }
  if (!data.ok) {
    return data;
  }

  // The injected function catches its own errors and reports them as data.
  if (parsedData.error) {
    return {
      ok: false,
      error: `Failed to parse page content: ${parsedData.error}`,
    };
  }

  // Create a mock document object that provides the same interface as a real DOM document
  // This allows getKeywords and getDescription to work without modification
  const mockDoc = createMockDocument(parsedData);

  if (deferCheck) {
    const [description, keywords, folders] = await Promise.all([
      Promise.resolve(getDescription(mockDoc)),
      getKeywords(parsedData, mockDoc),
      skipFolders ? [] : getFolders(),
    ]);
    return {
      ...data,
      description,
      keywords,
      folders,
      bookmarkID: -1,
      checkPending: true,
    };
  }

  // --- Run parallel operations for speed
  const [description, keywords, bookmarkCheckResult, folders] =
    await Promise.all([
      Promise.resolve(getDescription(mockDoc)), // Synchronous, but wrapped for consistency
      getKeywords(parsedData, mockDoc),
      checkPromise,
      skipFolders ? [] : getFolders(),
    ]);

  data.description = description;
  data.keywords = keywords;
  log(DEBUG, ':: ~ getData ~ data.keywords:', data.keywords);
  data.checkBookmark = bookmarkCheckResult;
  data.folders = folders;

  log(DEBUG, 'data', data);
  // Check if the url is already stored.
  // If the connection succeeded and the url was found the use stored data.
  if (data.checkBookmark.ok && data.checkBookmark.found) {
    // I'm using a different vocabulary
    data.checkBookmark.keywords = data.checkBookmark.tags;
    data.checkBookmark.folders = data.folders; // Don't forget the folders
    data.checkBookmark.bookmarkID = data.checkBookmark.id;
    data = data.checkBookmark;
    return data;
  } else {
    // If the connection was unsuccesful or the url was not found
    // mark it by setting the bookmark id to "-1"
    data.bookmarkID = -1;
    log(DEBUG, 'data', data);
    return data;
  }
}

/**
 * Registers a new lookup for a tab: aborts the previous one still running for
 * the same tab and returns the controller of the new one (dropped from the
 * registry again after ABORT_CONTROLLER_CLEANUP_MS).
 * @param {number} tabId
 * @returns {AbortController}
 */
function startTabRequest(tabId) {
  if (abortControllers.has(tabId)) {
    abortControllers.get(tabId).abort();
    log(DEBUG, `Cancelled previous request for tab ${tabId}`);
  }

  const abortController = new AbortController();
  abortControllers.set(tabId, abortController);

  setTimeout(() => {
    if (abortControllers.get(tabId) === abortController) {
      abortControllers.delete(tabId);
    }
  }, ABORT_CONTROLLER_CLEANUP_MS);

  return abortController;
}

/**
 * The server lookup of getData on its own: is the active tab's page already
 * bookmarked? The popup asks for it next to the page data
 * (getData with `deferCheck`), so the form does not wait for this round trip.
 *
 * The result always has `ok` and `bookmarkID`, and `checkBookmark` (the raw
 * lookup, whose own `ok: false` means the server could not be reached). If the
 * page is bookmarked it also carries the stored bookmark's fields -- `found`,
 * `keywords` (its tags), `title`, `description`, `url`, `added`,
 * `lastmodified` -- exactly what getData puts in its result in that case.
 * Fails like getData for a tab that cannot be bookmarked.
 *
 * @returns {Promise<Object>}
 */
export async function getBookmarkStatus() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) {
    return { ok: false, error: 'No active tab found' };
  }
  if (!isValidBookmarkableUrl(activeTab.url)) {
    return { ok: false, error: 'URL is not bookmarkable', retryable: false };
  }

  const { signal } = startTabRequest(activeTab.id);
  const checkBookmarkResult = await checkBookmark(activeTab.url, activeTab.title, signal);

  if (checkBookmarkResult.ok && checkBookmarkResult.found) {
    return {
      ...checkBookmarkResult,
      keywords: checkBookmarkResult.tags,
      bookmarkID: checkBookmarkResult.id,
      checkBookmark: checkBookmarkResult,
    };
  }
  return { ok: true, found: false, bookmarkID: -1, checkBookmark: checkBookmarkResult };
}

/**
 * Extracts page data from the active tab by injecting extractPageData
 * directly into it -- runs in the page's own isolated world (activeTab-
 * covered, no offscreen document involved) and returns the already-parsed
 * result.
 *
 * @param {number} tabId - Tab to extract from.
 * @param {number} headingLevel - How many heading levels to extract (see extractPageData).
 * @returns {Promise<Object>} The parsedData object (or {error} if extraction threw inside the page).
 */
async function getContent(tabId, headingLevel) {
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageData,
    args: [headingLevel],
  });

  // No result when the tab navigated or closed while the script was running.
  return (
    injectionResults?.[0]?.result ?? { error: 'No result from the page' }
  );
}

// ---------------------------------------------------------------------------------------------------
/**
 * Handles waiting for an in-flight request with proper abort signal handling:
 * the returned promise settles like `inflightPromise`, but rejects with an
 * AbortError as soon as `signal` aborts. The shared request itself keeps
 * running, since other callers may still be waiting for it.
 * @param {Promise<Object>} inflightPromise - The request started by another caller.
 * @param {AbortSignal|null} signal - This caller's abort signal.
 * @returns {Promise<Object>}
 */
async function waitForInflightRequest(inflightPromise, signal) {
  if (!signal) {
    return inflightPromise;
  }

  if (signal.aborted) {
    throw new DOMException('Request aborted', 'AbortError');
  }

  return new Promise((resolve, reject) => {
    const abortHandler = () => {
      reject(new DOMException('Request aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abortHandler);

    void (async () => {
      try {
        resolve(await inflightPromise);
      } catch (error) {
        reject(error);
      } finally {
        signal.removeEventListener('abort', abortHandler);
      }
    })();
  });
}

/**
 * Checks cache for a bookmark check result. Tries the URL as given first, then
 * its normalized form (results may have been stored under either).
 * @param {string} url - URL to look up.
 * @param {Object} options - Pre-fetched options (saves per-lookup option reads).
 * @returns {Promise<Object|null>} The cached result, or null on a miss or if
 *   caching is disabled.
 */
async function checkCache(url, options) {
  if (!options.cbx_cacheBookmarkChecks) return null;

  let cached = await getCachedBookmarkCheck(url, options);
  if (cached) {
    log(DEBUG, 'Using cached bookmark check (exact URL) for', url);
    return cached;
  }

  const normUrl = normalizeUrl(url);
  if (normUrl !== url) {
    cached = await getCachedBookmarkCheck(normUrl, options);
    if (cached) {
      log(DEBUG, 'Using cached bookmark check (normalized URL) for', url);
      return cached;
    }
  }

  return null;
}

/**
 * Finds out whether the page is already bookmarked on the server.
 *
 * Order: feature switch -> cache -> a request that is already running for the
 * same URL -> server lookup by URL, with (optionally) a lookup by similar title
 * running alongside it.
 * Successful lookups are cached.
 *
 * @param {string} url - The tab's URL.
 * @param {string} title - The tab's title, for the optional similar-title check.
 * @param {AbortSignal|null} [signal] - Aborts the wait/lookup.
 * @returns {Promise<{ok: boolean, found: boolean, matches: Array<Object>, count: number}>}
 *   `ok: false` means the server could not be reached (not "not found").
 */
async function checkBookmark(url, title, signal = null) {
  // One batched read: getOptions fetches in parallel off a single connection
  // and is Map-cached, so splitting this saved nothing and cost a second
  // IndexedDB round trip on a cold service worker.
  const allOptions = await getOptions([
    'cbx_alreadyStored',
    'cbx_cacheBookmarkChecks',
    'cbx_fuzzyUrlMatch',
    'input_bookmarkCacheTTL',
    'cbx_titleSimilarityCheck',
  ]);

  // The user turned the "already bookmarked?" check off: report "not found"
  // without any request.
  if (!allOptions.cbx_alreadyStored) {
    return { ok: true, found: false, matches: [], count: 0 };
  }

  const cached = await checkCache(url, allOptions);
  if (cached) return cached;

  // With fuzzy matching the normalized URL (http/https, www, trailing slash,
  // ... ignored) is what is searched for and cached; otherwise the exact URL.
  const normalizedUrl = normalizeUrl(url);
  const cacheKey = allOptions.cbx_fuzzyUrlMatch ? normalizedUrl : url;

  // Deduplicate: two callers checking the same URL at the same time share one
  // server request.
  if (inflightChecks.has(cacheKey)) {
    log(DEBUG, 'Request deduplication - waiting for in-flight check', url);
    return waitForInflightRequest(inflightChecks.get(cacheKey), signal);
  }

  log(DEBUG, 'Cache miss - fetching bookmark check from server for', url);

  const checkPromise = (async () => {
    // The optional title lookup is independent of the URL lookup, so it starts
    // right away instead of waiting for it -- one round trip less whenever the
    // page is not bookmarked yet. If the URL turns out to match, the title
    // request is no longer needed and is aborted (also when the caller aborts).
    const titleAbort = new AbortController();
    const abortTitle = () => titleAbort.abort();
    signal?.addEventListener('abort', abortTitle);
    try {
      const urlLookup = checkByUrl(cacheKey, signal);
      const titleLookup =
        allOptions.cbx_titleSimilarityCheck && title
          ? checkByTitle(title, titleAbort.signal) // never rejects
          : null;

      let urlMatches = await urlLookup;

      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      if (urlMatches.found && urlMatches.matches.length > 0) {
        log(DEBUG, 'Found exact URL match - dropping title check');
        titleAbort.abort();
        // Fire-and-forget: the response must not wait on an IndexedDB write
        // (cacheBookmarkCheck handles its own errors).
        void cacheBookmarkCheck(cacheKey, urlMatches, allOptions);
        return urlMatches;
      }

      // No URL match: a bookmark with a similar title (catches the same
      // article under a different URL) still counts.
      const titleMatches = titleLookup ? await titleLookup : [];
      if (titleMatches.length > 0) {
        const mergedMatches = mergeMatches(urlMatches.matches, titleMatches);
        urlMatches.matches = mergedMatches;
        urlMatches.count = mergedMatches.length;
        urlMatches.found = mergedMatches.length > 0;

        if (mergedMatches.length > 0) {
          // Like checkByUrl, expose the best match's fields at the top level.
          urlMatches = { ...urlMatches, ...mergedMatches[0] };
        }
      }

      // Never cache a failed lookup, or a short outage would be remembered as
      // "not bookmarked" for the whole cache TTL.
      if (urlMatches.ok) {
        void cacheBookmarkCheck(cacheKey, urlMatches, allOptions);
      }

      log(DEBUG, 'checkBookmark response', urlMatches);
      return urlMatches;
    } finally {
      signal?.removeEventListener('abort', abortTitle);
      titleAbort.abort(); // no-op once the title request has finished
      inflightChecks.delete(cacheKey);
    }
  })();

  // Store the promise
  inflightChecks.set(cacheKey, checkPromise);

  return checkPromise;
}

// ---------------------------------------------------------------------------------------------------
/**
 * Asks the server for bookmarks with exactly this URL.
 * @param {string} url - The URL to search for (normalized by the caller if wanted).
 * @param {AbortSignal|null} [signal]
 * @returns {Promise<Object>} `{ok, found, matches, count}`, with the first
 *   match's fields merged in when found; `ok: false` if the request failed.
 */
async function checkByUrl(url, signal = null) {
  // OPTIMIZATION: URL is already normalized by caller when needed
  // No need to normalize again - just use the URL as-is
  const searchUrl = url;

  const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
  const method = 'GET';
  const data = new URLSearchParams({ url: searchUrl, page: -1 }).toString();
  const result = await apiCall(endpoint, method, data, signal);

  // if the server responded check if any data was received
  let response = {};
  log(DEBUG, 'checkByUrl result', result);

  if (result.status === 'success') {
    if (result.data.length > 0) {
      // Return all matches
      response.ok = true;
      response.found = true;
      response.matches = result.data;
      response.count = result.data.length;

      // For backward compatibility, also include first match data at root level
      response = { ...response, ...result.data[0] };
    } else {
      // No bookmarks found
      response.ok = true;
      response.found = false;
      response.matches = [];
      response.count = 0;
    }
  } else {
    // connection timed out, mark as unsuccessful
    log(DEBUG, 'checkByUrl failed', result);
    response.ok = false;
    response.found = false;
    response.matches = [];
    response.count = 0;
  }

  return response;
}

// ---------------------------------------------------------------------------------------------------
/**
 * Looks for bookmarks with a title similar to `title` among the user's most
 * recent bookmarks (only a limited number is fetched, for speed).
 * @param {string} title
 * @param {AbortSignal|null} [signal]
 * @returns {Promise<Array<Object>>} Matching bookmarks with a `similarity`
 *   score, best first; [] on any failure.
 */
async function checkByTitle(title, signal = null) {
  log(DEBUG, 'Checking by title similarity:', title);

  try {
    // Batch fetch options for speed
    const options = await getOptions([
      'input_titleCheckLimit',
      'input_titleSimilarityThreshold',
    ]);

    const limit = options.input_titleCheckLimit || 20;
    const threshold = (options.input_titleSimilarityThreshold || 75) / 100;

    // Fetch recent bookmarks (limited for performance)
    const endpoint = 'index.php/apps/bookmarks/public/rest/v2/bookmark';
    const method = 'GET';
    const data = new URLSearchParams({ page: 0, limit }).toString();
    const result = await apiCall(endpoint, method, data, signal);

    // Aborted while in flight (the URL matched, so the answer is not needed).
    if (signal?.aborted) return [];

    if (result.status !== 'success') {
      log(DEBUG, 'Title check failed - API error');
      return [];
    }

    // Use batch processing for better performance
    const matches = batchSimilarityCheck(title, result.data, threshold);

    // Log results for debugging
    if (DEBUG) {
      matches.forEach((match) => {
        log(DEBUG, `Title similarity: ${match.title} = ${match.similarity}`);
      });
    }

    log(DEBUG, `Found ${matches.length} similar titles`);
    return matches;
  } catch (error) {
    log(DEBUG, 'Title check failed with error:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------------------------------
/**
 * Combines URL and title matches into one list without duplicates (by
 * bookmark ID). URL matches come first, then title matches by similarity.
 * @param {Array<Object>} urlMatches
 * @param {Array<Object>} titleMatches
 * @returns {Array<Object>} Matches tagged with `matchType` ('url'|'title').
 */
function mergeMatches(urlMatches, titleMatches) {
  // Create a Map to avoid duplicates based on bookmark ID
  const matchMap = new Map();

  // Add URL matches first (higher priority)
  for (const match of urlMatches) {
    matchMap.set(match.id, { ...match, matchType: 'url', priority: 1 });
  }

  // Add title matches (only if not already matched by URL)
  for (const match of titleMatches) {
    if (!matchMap.has(match.id)) {
      matchMap.set(match.id, { ...match, matchType: 'title', priority: 2 });
    }
  }

  // Convert to array and sort by priority, then by similarity
  const merged = Array.from(matchMap.values());
  merged.sort((a, b) => {
    // First by priority (URL matches first)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Then by similarity if available
    return (b.similarity || 0) - (a.similarity || 0);
  });

  return merged;
}
