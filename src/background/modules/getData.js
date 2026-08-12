// @ts-check
import getDescription from './getDescription.js';
import getKeywords from './getKeywords.js';
import { getFolders } from './getFolders.js';
import apiCall from '../../lib/apiCall.js';
import { getOptions } from '../../lib/storage.js';
import log from '../../lib/log.js';
import { normalizeUrl } from '../../lib/urlNormalizer.js';
import { getCachedBookmarkCheck, cacheBookmarkCheck } from '../../lib/cache.js';
import {
  calculateSimilarity,
  batchSimilarityCheck,
} from '../../lib/stringSimilarity.js';
import { createMockDocument } from './mockDocument.js';
import { extractPageData } from './extractPageData.js';

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
    'about:',
    'data:',
    'blob:',
    'javascript:',
  ];

  for (const protocol of nonBookmarkableProtocols) {
    if (url.startsWith(protocol)) return false;
  }

  return true;
}

export default async function getData() {
  let data = { ok: true };

  // Needed before extraction can run (bounds how many heading levels the
  // injected function walks). Started here, in parallel with the tab lookup
  // below, rather than serially in front of it.
  const headingLevelPromise = getOptions(['input_headings_slider']);

  // --- get active tab info first (fast operation)
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  data.url = activeTab.url;
  data.title = activeTab.title;

  // Cancel any previous request for this specific tab
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
      checkBookmark(data.url, data.title, abortController.signal),
      getFolders(),
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

  return injectionResults[0].result;
}

// ---------------------------------------------------------------------------------------------------
/**
 * Handles waiting for an in-flight request with proper abort signal handling
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

    (async () => {
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
 * Checks cache for a bookmark check result
 */
async function checkCache(url, cacheBookmarkChecks) {
  if (!cacheBookmarkChecks) return null;

  let cached = await getCachedBookmarkCheck(url);
  if (cached) {
    log(DEBUG, 'Using cached bookmark check (exact URL) for', url);
    return cached;
  }

  const normUrl = normalizeUrl(url);
  if (normUrl !== url) {
    cached = await getCachedBookmarkCheck(normUrl);
    if (cached) {
      log(DEBUG, 'Using cached bookmark check (normalized URL) for', url);
      return cached;
    }
  }

  return null;
}

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

  if (!allOptions.cbx_alreadyStored) {
    return { ok: true, found: false, matches: [], count: 0 };
  }

  const cached = await checkCache(url, allOptions.cbx_cacheBookmarkChecks);
  if (cached) return cached;

  const normalizedUrl = normalizeUrl(url);
  const cacheKey = allOptions.cbx_fuzzyUrlMatch ? normalizedUrl : url;

  if (inflightChecks.has(cacheKey)) {
    log(DEBUG, 'Request deduplication - waiting for in-flight check', url);
    return waitForInflightRequest(inflightChecks.get(cacheKey), signal);
  }

  log(DEBUG, 'Cache miss - fetching bookmark check from server for', url);

  const checkPromise = (async () => {
    try {
      let urlMatches = await checkByUrl(cacheKey, signal);

      if (signal && signal.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      if (urlMatches.found && urlMatches.matches.length > 0) {
        log(DEBUG, 'Found exact URL match - skipping title check');
        await cacheBookmarkCheck(cacheKey, urlMatches, allOptions);
        return urlMatches;
      }

      if (allOptions.cbx_titleSimilarityCheck && title) {
        const titleMatches = await checkByTitle(title, signal);

        if (titleMatches.length > 0) {
          const mergedMatches = mergeMatches(urlMatches.matches, titleMatches);
          urlMatches.matches = mergedMatches;
          urlMatches.count = mergedMatches.length;
          urlMatches.found = mergedMatches.length > 0;

          if (mergedMatches.length > 0) {
            urlMatches = { ...urlMatches, ...mergedMatches[0] };
          }
        }
      }

      if (urlMatches.ok) {
        await cacheBookmarkCheck(cacheKey, urlMatches, allOptions);
      }

      log(DEBUG, 'checkBookmark response', urlMatches);
      return urlMatches;
    } finally {
      inflightChecks.delete(cacheKey);
    }
  })();

  // Store the promise
  inflightChecks.set(cacheKey, checkPromise);

  return checkPromise;
}

// ---------------------------------------------------------------------------------------------------
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
