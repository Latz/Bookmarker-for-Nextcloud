/**
 * URL Normalizer - Utility for normalizing URLs to catch duplicates
 * Handles common URL variations like protocol, www, trailing slashes, etc.
 */

// Memoization cache for normalized URLs (LRU cache with max 1000 entries)
const normalizeCache = new Map();
const CACHE_MAX_SIZE = 1000;

/**
 * Normalize a URL to catch common variants
 * @param {string} urlString - The URL to normalize
 * @param {Object} options - Normalization options
 * @param {boolean} options.normalizeProtocol - Convert http to https (default: true)
 * @param {boolean} options.removeWWW - Remove www prefix (default: true)
 * @param {boolean} options.removeTrailingSlash - Remove trailing slash (default: true)
 * @param {boolean} options.sortQueryParams - Sort query parameters alphabetically (default: true)
 * @param {boolean} options.removeFragment - Remove URL fragment/hash (default: true)
 * @returns {string} Normalized URL
 */
export function normalizeUrl(urlString, options = {}) {
  const {
    normalizeProtocol = true,
    removeWWW = true,
    removeTrailingSlash = true,
    sortQueryParams = true,
    removeFragment = true,
  } = options;

  // Create cache key from URL + options
  const cacheKey = `${urlString}|${normalizeProtocol}|${removeWWW}|${removeTrailingSlash}|${sortQueryParams}|${removeFragment}`;

  // Check cache first
  if (normalizeCache.has(cacheKey)) {
    const cached = normalizeCache.get(cacheKey);
    // Move to end (LRU)
    normalizeCache.delete(cacheKey);
    normalizeCache.set(cacheKey, cached);
    return cached;
  }

  try {
    let url = new URL(urlString);

    // Normalize protocol: http → https
    if (normalizeProtocol && url.protocol === 'http:') {
      url.protocol = 'https:';
    }

    // Remove www prefix
    if (removeWWW && url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.substring(4);
    }

    // Sort query parameters alphabetically
    if (sortQueryParams && url.search) {
      const params = new URLSearchParams(url.search);
      const sortedParams = new URLSearchParams(
        [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      );
      url.search = sortedParams.toString();
    }

    // Remove fragment/hash
    if (removeFragment) {
      url.hash = '';
    }

    let normalizedUrl = url.toString();

    // Remove trailing slash (but not for root paths like https://example.com/)
    if (
      removeTrailingSlash &&
      normalizedUrl.endsWith('/') &&
      url.pathname !== '/'
    ) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    // Cache the result
    normalizeCache.set(cacheKey, normalizedUrl);

    // Implement LRU: remove oldest entry if cache is full
    if (normalizeCache.size > CACHE_MAX_SIZE) {
      const firstKey = normalizeCache.keys().next().value;
      normalizeCache.delete(firstKey);
    }

    return normalizedUrl;
  } catch (error) {
    // If URL parsing fails, return original string
    console.warn('URL normalization failed:', error);
    return urlString;
  }
}

/**
 * Check if two URLs are equivalent after normalization
 * @param {string} url1 - First URL
 * @param {string} url2 - Second URL
 * @param {Object} options - Normalization options (passed to normalizeUrl)
 * @returns {boolean} True if URLs are equivalent
 */
export function urlsAreEquivalent(url1, url2, options = {}) {
  return normalizeUrl(url1, options) === normalizeUrl(url2, options);
}
