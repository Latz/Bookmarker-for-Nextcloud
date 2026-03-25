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
import { parseHTMLWithOffscreen, ensureOffscreenDocument } from './getBrowserTheme.js';

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
  let content = '';
  let data = { ok: true };

  // --- get active tab info first (fast operation)
  const activeTab = await chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0]);

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
    };
  }

  // Kick off offscreen doc preparation in parallel with content fetch.
  // ensureOffscreenDocument is idempotent and deduplicated, so the later
  // call inside parseHTMLWithOffscreen returns immediately if it already ran.
  const offscreenReady = ensureOffscreenDocument();

  // unable to not get content, for example restricted pages
  try {
    content = await getContent(tabId);
  } catch (error) {
    data = {
      ok: false,
      error: error.message,
    };
  }
  if (!data.ok) {
    return data;
  }

  // Ensure offscreen setup is complete before parsing
  await offscreenReady;

  // Use offscreen document to parse HTML (DOMParser not available in service worker)
  let parsedData;
  try {
    parsedData = await parseHTMLWithOffscreen(content);
  } catch (error) {
    return {
      ok: false,
      error: `Failed to parse page content: ${error.message}`,
    };
  }

  // Create a mock document object that provides the same interface as a real DOM document
  // This allows getKeywords and getDescription to work without modification
  const mockDoc = createMockDocument(parsedData);

  // --- Run parallel operations for speed
  const [description, keywords, bookmarkCheckResult, folders] =
    await Promise.all([
      Promise.resolve(getDescription(mockDoc)), // Synchronous, but wrapped for consistency
      getKeywords(content, mockDoc),
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
 * Retrieves the content of the active tab in the Chrome browser.
 *
 * @returns {Promise<string>} The HTML content of the active tab.
 */
async function getContent(tabId) {
  // Execute a script in the active tab to retrieve the HTML content
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.innerHTML,
  });

  // Return the HTML content
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

    inflightPromise
      .then((result) => {
        signal.removeEventListener('abort', abortHandler);
        resolve(result);
      })
      .catch((error) => {
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      });
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
  const essentialOptions = await getOptions([
    'cbx_alreadyStored',
    'cbx_cacheBookmarkChecks',
  ]);

  if (!essentialOptions.cbx_alreadyStored) {
    return { ok: true, found: false, matches: [], count: 0 };
  }

  const cached = await checkCache(
    url,
    essentialOptions.cbx_cacheBookmarkChecks,
  );
  if (cached) return cached;

  const remainingOptions = await getOptions([
    'cbx_fuzzyUrlMatch',
    'input_bookmarkCacheTTL',
    'cbx_titleSimilarityCheck',
  ]);

  const allOptions = { ...essentialOptions, ...remainingOptions };
  const normalizedUrl = normalizeUrl(url);
  const cacheKey = allOptions.cbx_fuzzyUrlMatch ? normalizedUrl : url;

  if (inflightChecks.has(cacheKey)) {
    log(DEBUG, 'Request deduplication - waiting for in-flight check', url);
    return waitForInflightRequest(inflightChecks.get(cacheKey), signal);
  }

  log(DEBUG, 'Cache miss - fetching bookmark check from server for', url);

  const checkPromise = (async () => {
    try {
      const urlMatches = await checkByUrl(cacheKey, signal);

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
            Object.assign(urlMatches, mergedMatches[0]);
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
      Object.assign(response, result.data[0]);
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

/**
 * Creates a mock document object that provides the same interface as a real DOM document
 * This allows getKeywords and getDescription to work without modification
 * @param {Object} parsedData - The parsed data from offscreen document
 * @returns {Object} Mock document object with DOM-like methods
 */
function createMockDocument(parsedData) {
  const mockDoc = {
    // querySelectorAll implementation - handles both simple and complex selectors
    querySelectorAll: function (selector) {
      // Handle specific selectors used in getKeywords.js
      if (selector === 'a[rel=tag]') {
        return parsedData.aRelTag.map((text) => ({ textContent: text }));
      }
      if (selector === 'a[rel=category]') {
        return parsedData.aRelCategory.map((text) => ({
          text: text,
          textContent: text,
        }));
      }
      if (selector === 'script[type="application/ld+json"]') {
        return parsedData.jsonLdScripts.map((text) => ({ innerText: text }));
      }
      if (selector === 'script') {
        return parsedData.scripts.map((text) => ({ text: text }));
      }
      if (selector === 'a[data-ga-click="Topic, repository page"]') {
        return parsedData.githubTopics.map((text) => ({
          textContent: text,
          trim: () => text.trim(),
        }));
      }
      // GitHub topic selectors (updated 2025)
      if (
        selector === 'a[class*="topic-tag"]' ||
        selector === 'a[data-view-component="true"][title^="Topic:"]' ||
        selector === 'a[href^="/topics/"]'
      ) {
        return parsedData.githubTopics.map((text) => ({
          textContent: text,
          trim: () => text.trim(),
        }));
      }
      // GitHub topic name spans (nested inside topic links)
      if (selector === 'a[href^="/topics/"] .topic-tag-name' || selector === 'span.topic-tag-name') {
        return parsedData.githubTopics.map((text) => ({
          textContent: text,
          trim: () => text.trim(),
        }));
      }
      // For headlines
      if (selector.startsWith('h') && selector.length === 2) {
        const headlines = parsedData.headlines[selector] || [];
        return headlines.map((text) => ({
          textContent: text,
          innerText: text,
          split: (regex) => text.split(regex),
        }));
      }

      // Handle meta tag selectors used by getMeta.js
      // Format examples: [property="og:description" i], [name="description"], [name="description" i]
      if (selector.includes('[') && selector.includes(']')) {
        // Extract attribute selector - handle both quoted and unquoted values
        // Match patterns like: [name="description"], [property="og:description" i], [name=description]
        const attrMatch = selector.match(
          /\[([^\]=]+)=(?:"([^"]+)"|([^\s\]]+))(\s+i)?\]/,
        );
        if (attrMatch) {
          const attrName = attrMatch[1];
          const attrValue = attrMatch[2] || attrMatch[3]; // Either quoted or unquoted
          const isCaseInsensitive = !!attrMatch[4]; // Has " i" suffix

          const filtered = parsedData.metaTags.filter((meta) => {
            const actualValue = meta[attrName];
            if (!actualValue || !attrValue) return false;

            if (isCaseInsensitive) {
              return actualValue.toLowerCase() === attrValue.toLowerCase();
            }
            return actualValue === attrValue;
          });

          return filtered.map((meta) => ({
            getAttribute: (attr) => meta[attr],
            content: meta.content,
          }));
        }
      }

      return [];
    },

    // getElementById implementation
    getElementById: function (id) {
      if (id === '__NEXT_DATA__') {
        return parsedData.nextData
          ? { innerText: parsedData.nextData, textContent: parsedData.nextData }
          : null;
      }
      return null;
    },

    // querySelector implementation (for single element)
    querySelector: function (selector) {
      const results = this.querySelectorAll(selector);
      return results.length > 0 ? results[0] : null;
    },
  };

  return mockDoc;
}
