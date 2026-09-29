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
 * @param {{skipFolders?: boolean}} [options] - `skipFolders`: leave the folder
 *   list out (`folders` is then []). For callers that never show it, such as
 *   zen mode: the list is a cache read at best and a server request once its
 *   24h cache has expired.
 * @returns {Promise<Object>}
 */
export default async function getData(options) {
  const skipFolders = options?.skipFolders === true;
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

  // Cancel any previous request for this specific tab (e.g. the popup was
  // reopened while the last lookup was still running).
  const tabId = activeTab.id;
  if (abortControllers.has(tabId)) {
    const previousController = abortControllers.get(tabId);
    previousController.abort();
    log(DEBUG, `Cancelled previous request for tab ${tabId}`);
  }

  // Create new abort controller for this tab's request
  const abortController = new AbortController();
  abortControllers.set(tabId, abortController);

  // Schedule cleanup of this abort controller
  setTimeout(() => {
    if (abortControllers.get(tabId) === abortController) {
      abortControllers.delete(tabId);
    }
  }, ABORT_CONTROLLER_CLEANUP_MS);

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
  const checkPromise = checkBookmark(data.url, data.title, abortController.signal);
  checkPromise.catch(() => {});

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
