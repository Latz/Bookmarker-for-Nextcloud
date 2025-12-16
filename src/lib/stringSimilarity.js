/**
 * String Similarity Calculator
 * Uses Jaro-Winkler distance algorithm for comparing strings
 * Good for short strings like titles, names, etc.
 * Optimized with pre-filtering and caching for speed
 */

// Memoization cache for similarity calculations (LRU cache)
const similarityCache = new Map();
const CACHE_MAX_SIZE = 500;

/**
 * Fast pre-filter: Quick rejection based on simple metrics
 * Returns estimated similarity (0-1) or null if we should do full calculation
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @param {number} threshold - Minimum threshold to pass
 * @returns {number|null} Estimated similarity or null to continue
 */
function fastPreFilter(s1, s2, threshold = 0.75) {
  // Exact match
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;

  // Empty strings
  if (len1 === 0 || len2 === 0) return 0.0;

  // Length difference > 50% of longer string = very unlikely to match
  const maxLen = Math.max(len1, len2);
  const minLen = Math.min(len1, len2);
  const lengthRatio = minLen / maxLen;

  if (lengthRatio < 0.5) return 0.0;

  // Quick character overlap check (faster than Jaro-Winkler)
  // Count common characters (case matters here since we pre-normalize)
  const chars1 = new Set(s1);
  const chars2 = new Set(s2);
  let commonChars = 0;

  for (const char of chars1) {
    if (chars2.has(char)) commonChars++;
  }

  // Estimate similarity based on character overlap
  const charOverlap = commonChars / Math.max(chars1.size, chars2.size);

  // If character overlap is too low, reject early
  if (charOverlap < threshold * 0.6) return 0.0;

  // If very high overlap and similar length, likely a good match
  if (charOverlap > 0.9 && lengthRatio > 0.9) return charOverlap;

  // Otherwise, need full calculation
  return null;
}

/**
 * Calculate Jaro similarity between two strings
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function jaroSimilarity(s1, s2) {
  // Handle edge cases
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Find transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3.0
  );
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 * Gives more weight to strings that match from the beginning
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @param {number} prefixScale - Scaling factor for prefix (default: 0.1)
 * @returns {number} Similarity score between 0 and 1
 */
function jaroWinklerSimilarity(s1, s2, prefixScale = 0.1) {
  const jaroScore = jaroSimilarity(s1, s2);

  // Find common prefix up to 4 characters
  let prefixLength = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));

  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  return jaroScore + prefixLength * prefixScale * (1 - jaroScore);
}

/**
 * Calculate similarity between two strings
 * Normalizes strings (lowercase, trim) before comparison
 * Optimized with caching and pre-filtering
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {Object} options - Comparison options
 * @param {boolean} options.caseSensitive - Case sensitive comparison (default: false)
 * @param {boolean} options.trim - Trim whitespace (default: true)
 * @param {number} options.threshold - Optional threshold for early rejection (0-1)
 * @returns {number} Similarity score between 0 and 1
 * @throws {TypeError} If str1 or str2 is not a string
 */
export function calculateSimilarity(str1, str2, options = {}) {
  // Input validation
  if (typeof str1 !== 'string' || typeof str2 !== 'string') {
    throw new TypeError(
      `Both arguments must be strings. Received: str1=${typeof str1}, str2=${typeof str2}`,
    );
  }

  const { caseSensitive = false, trim = true, threshold = 0 } = options;

  let s1 = str1;
  let s2 = str2;

  // Normalize strings
  if (trim) {
    s1 = s1.trim();
    s2 = s2.trim();
  }

  if (!caseSensitive) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
  }

  // Check cache
  const cacheKey = `${s1}||${s2}`;
  if (similarityCache.has(cacheKey)) {
    const cached = similarityCache.get(cacheKey);
    // Move to end (LRU)
    similarityCache.delete(cacheKey);
    similarityCache.set(cacheKey, cached);
    return cached;
  }

  // Fast pre-filter for early rejection/acceptance
  const preFilterResult = fastPreFilter(s1, s2, threshold);
  if (preFilterResult !== null) {
    // Cache and return
    similarityCache.set(cacheKey, preFilterResult);
    if (similarityCache.size > CACHE_MAX_SIZE) {
      const firstKey = similarityCache.keys().next().value;
      similarityCache.delete(firstKey);
    }
    return preFilterResult;
  }

  // Full Jaro-Winkler calculation
  const result = jaroWinklerSimilarity(s1, s2);

  // Cache the result
  similarityCache.set(cacheKey, result);
  if (similarityCache.size > CACHE_MAX_SIZE) {
    const firstKey = similarityCache.keys().next().value;
    similarityCache.delete(firstKey);
  }

  return result;
}

/**
 * Check if two strings are similar based on a threshold
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} threshold - Minimum similarity score (0-1)
 * @param {Object} options - Comparison options
 * @returns {boolean} True if strings are similar enough
 * @throws {TypeError} If str1 or str2 is not a string
 */
export function isSimilar(str1, str2, threshold = 0.75, options = {}) {
  // Input validation delegated to calculateSimilarity
  return (
    calculateSimilarity(str1, str2, { ...options, threshold }) >= threshold
  );
}

/**
 * Find the most similar string from an array
 * Optimized with early exits and threshold pre-filtering
 * @param {string} target - Target string to compare against
 * @param {Array<string>} candidates - Array of candidate strings
 * @param {number} threshold - Minimum similarity score (0-1)
 * @param {Object} options - Comparison options
 * @returns {Object|null} Object with {value: string, score: number} or null if no match above threshold
 * @throws {TypeError} If target is not a string or candidates is not an array
 */
export function findMostSimilar(
  target,
  candidates,
  threshold = 0.75,
  options = {},
) {
  // Input validation
  if (typeof target !== 'string') {
    throw new TypeError(`Target must be a string. Received: ${typeof target}`);
  }
  if (!Array.isArray(candidates)) {
    throw new TypeError(
      `Candidates must be an array. Received: ${typeof candidates}`,
    );
  }

  let bestMatch = null;
  let bestScore = threshold;

  for (const candidate of candidates) {
    // Skip non-string candidates
    if (typeof candidate !== 'string') continue;

    const score = calculateSimilarity(target, candidate, {
      ...options,
      threshold: bestScore, // Use current best as threshold for pre-filtering
    });

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { value: candidate, score };

      // Early exit if we find a perfect or near-perfect match
      if (score >= 0.98) break;
    }
  }

  return bestMatch;
}

/**
 * Batch process similarity checks for multiple candidates
 * More efficient than calling calculateSimilarity in a loop
 * @param {string} target - Target string to compare against
 * @param {Array<{id: any, title: string}>} candidates - Array of candidate objects with title property
 * @param {number} threshold - Minimum similarity score (0-1)
 * @param {Object} options - Comparison options
 * @returns {Array<Object>} Array of matches above threshold with similarity scores
 * @throws {TypeError} If target is not a string or candidates is not an array
 */
export function batchSimilarityCheck(
  target,
  candidates,
  threshold = 0.75,
  options = {},
) {
  // Input validation
  if (typeof target !== 'string') {
    throw new TypeError(`Target must be a string. Received: ${typeof target}`);
  }
  if (!Array.isArray(candidates)) {
    throw new TypeError(
      `Candidates must be an array. Received: ${typeof candidates}`,
    );
  }

  const matches = [];
  let bestScore = 0;

  for (const candidate of candidates) {
    // Skip if candidate doesn't have a title or title is not a string
    if (!candidate.title || typeof candidate.title !== 'string') continue;

    // Use current best score for pre-filtering optimization
    const effectiveThreshold = Math.max(threshold, bestScore * 0.9);

    const score = calculateSimilarity(target, candidate.title, {
      ...options,
      threshold: effectiveThreshold,
    });

    if (score >= threshold) {
      matches.push({
        ...candidate,
        similarity: score,
      });

      bestScore = Math.max(bestScore, score);

      // Early exit on perfect match
      if (score >= 0.99) break;
    }
  }

  // Sort by similarity (highest first)
  matches.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  return matches;
}

/**
 * Clear the similarity cache (useful for memory management)
 */
export function clearSimilarityCache() {
  similarityCache.clear();
}
