// @ts-check
/**
 * Adapts the flat data extracted by the offscreen document into an object with
 * the small slice of the DOM API that getKeywords and getDescription use.
 *
 * Lives in its own module so it can be unit-tested without pulling in
 * getData.js's dependency graph (apiCall, storage, cache, offscreen).
 */

/**
 * Parses a single CSS attribute selector, e.g. [name="description" i],
 * without a backtracking-prone regex -- the shape is fixed (getMeta.js is
 * the only caller), so plain string slicing covers it.
 * @param {string} selector - A `[attr=value]`-shaped selector, brackets included.
 * @returns {{attrName: string, attrValue: string, isCaseInsensitive: boolean}|null}
 */
function parseAttributeSelector(selector) {
  const body = selector.slice(1, -1); // strip [ and ]
  const eqIndex = body.indexOf('=');
  if (eqIndex === -1) return null;

  const attrName = body.slice(0, eqIndex);
  let rest = body.slice(eqIndex + 1);

  const isCaseInsensitive = rest.endsWith(' i');
  if (isCaseInsensitive) rest = rest.slice(0, -2).trimEnd();

  const attrValue =
    rest.startsWith('"') && rest.endsWith('"') ? rest.slice(1, -1) : rest;

  return { attrName, attrValue, isCaseInsensitive };
}

/**
 * Creates a mock document object that provides the same interface as a real DOM document
 * This allows getKeywords and getDescription to work without modification
 * @param {Object} parsedData - The parsed data from offscreen document
 * @returns {Object} Mock document object with DOM-like methods
 */
export function createMockDocument(parsedData) {
  // Lazily built index: attribute name -> lowercased value -> matching metas.
  // getMeta is called with 7 selectors from getDescription and 9 from
  // getKeywords, and each one used to scan the whole metaTags array. Building
  // one bucket per attribute name turns the repeats into hash lookups.
  const metaIndex = new Map();

  // extractPageData stores a meta tag's http-equiv attribute as `httpEquiv`,
  // but selectors (and getAttribute) use the DOM name. Without the mapping the
  // http-equiv sources in getDescription and metaKeywords never matched.
  const metaKey = (attrName) => (attrName === 'http-equiv' ? 'httpEquiv' : attrName);

  /**
   * @param {string} attrName - Meta attribute to match on (name, property, ...).
   * @param {string} attrValue - Value to look up; matched case-insensitively.
   * @returns {Array<Object>} Matching raw meta entries, or an empty array.
   */
  function metaBucket(attrName, attrValue) {
    if (!attrValue) return [];
    let byValue = metaIndex.get(attrName);
    if (!byValue) {
      byValue = new Map();
      for (const meta of parsedData.metaTags) {
        const actual = meta[metaKey(attrName)];
        if (!actual) continue;
        const key = actual.toLowerCase();
        const bucket = byValue.get(key);
        if (bucket) bucket.push(meta);
        else byValue.set(key, [meta]);
      }
      metaIndex.set(attrName, byValue);
    }
    return byValue.get(attrValue.toLowerCase()) ?? [];
  }

  // Selectors with a fixed textual match -- keyed by selector string so
  // querySelectorAll can look them up instead of testing each one in turn.
  const literalSelectorHandlers = new Map([
    [
      'a[rel=tag]',
      () => parsedData.aRelTag.map((text) => ({ textContent: text })),
    ],
    [
      'a[rel=category]',
      () =>
        parsedData.aRelCategory.map((text) => ({
          text: text,
          textContent: text,
        })),
    ],
    [
      'script[type="application/ld+json"]',
      () => parsedData.jsonLdScripts.map((text) => ({ innerText: text })),
    ],
    ['script', () => parsedData.scripts.map((text) => ({ text: text }))],
  ]);

  // GitHub topic selectors (legacy + updated 2025 structure), plus the
  // nested topic-name spans -- all resolve to the same githubTopics data.
  const githubTopicSelectors = new Set([
    'a[data-ga-click="Topic, repository page"]',
    'a[class*="topic-tag"]',
    'a[data-view-component="true"][title^="Topic:"]',
    'a[href^="/topics/"]',
    'a[href^="/topics/"] .topic-tag-name',
    'span.topic-tag-name',
  ]);
  const toGithubTopicElements = () =>
    parsedData.githubTopics.map((text) => ({
      textContent: text,
      trim: () => text.trim(),
    }));

  const mockDoc = {
    // querySelectorAll implementation - handles both simple and complex selectors
    querySelectorAll: function (selector) {
      // Handle specific selectors used in getKeywords.js
      if (literalSelectorHandlers.has(selector)) {
        return literalSelectorHandlers.get(selector)();
      }
      if (githubTopicSelectors.has(selector)) {
        return toGithubTopicElements();
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
      const bracketStart = selector.indexOf('[');
      if (bracketStart !== -1 && selector.endsWith(']')) {
        const attrMatch = parseAttributeSelector(selector.slice(bracketStart));
        if (attrMatch) {
          const { attrName, attrValue, isCaseInsensitive } = attrMatch;

          // The index is keyed case-insensitively; a case-sensitive selector
          // just filters the (small) bucket down to exact matches.
          const bucket = metaBucket(attrName, attrValue);
          const filtered = isCaseInsensitive
            ? bucket
            : bucket.filter((meta) => meta[metaKey(attrName)] === attrValue);

          return filtered.map((meta) => ({
            getAttribute: (attr) => meta[metaKey(attr)],
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
