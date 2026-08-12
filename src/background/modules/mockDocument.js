// @ts-check
/**
 * Adapts the flat data extracted by the offscreen document into an object with
 * the small slice of the DOM API that getKeywords and getDescription use.
 *
 * Lives in its own module so it can be unit-tested without pulling in
 * getData.js's dependency graph (apiCall, storage, cache, offscreen).
 */

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
        const actual = meta[attrName];
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

          // The index is keyed case-insensitively; a case-sensitive selector
          // just filters the (small) bucket down to exact matches.
          const bucket = metaBucket(attrName, attrValue);
          const filtered = isCaseInsensitive
            ? bucket
            : bucket.filter((meta) => meta[attrName] === attrValue);

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
