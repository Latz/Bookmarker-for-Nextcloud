// @ts-check
/**
 * Extracts the data getKeywords/getDescription need directly from the live
 * page DOM.
 *
 * This function is injected into the active tab via
 * chrome.scripting.executeScript({ func: extractPageData, args: [...] }), so
 * it runs in the page's own isolated world -- Chrome serializes it with
 * Function.prototype.toString() and re-parses it there. That means it CANNOT
 * close over any module-scope binding, cannot import anything, and any helper
 * it needs must be declared inside its own body. Its return value crosses
 * back to the service worker via structured clone, so it must be plain data
 * (no DOM nodes, no functions).
 *
 * Replaces the old two-hop path: shipping the entire page HTML
 * (documentElement.innerHTML, often 1-5 MB) to the service worker, which
 * forwarded it again to an offscreen document for DOMParser extraction. Only
 * this function's small return value ever leaves the page now.
 *
 * @param {number} headingLevel - How many heading levels (h1..hN) to extract, from the user's input_headings_slider option.
 * @returns {{
 *   metaTags: Array<{name: string|null, property: string|null, itemprop: string|null, httpEquiv: string|null, content: string|null}>,
 *   aRelTag: string[],
 *   aRelCategory: string[],
 *   jsonLdScripts: string[],
 *   scripts: string[],
 *   githubTopics: string[],
 *   nextData: string,
 *   description: string[],
 *   headlines: {h1: string[], h2: string[], h3: string[], h4: string[], h5: string[], h6: string[]},
 *   xplKeywords: string[],
 *   bruteForceKeywords: string[],
 * } | {error: string}}
 */
export function extractPageData(headingLevel) {
  try {
    const metaTags = Array.from(document.querySelectorAll('meta')).map((meta) => ({
      name: meta.getAttribute('name'),
      property: meta.getAttribute('property'),
      itemprop: meta.getAttribute('itemprop'),
      httpEquiv: meta.getAttribute('http-equiv'),
      content: meta.getAttribute('content'),
    }));

    const aRelTag = Array.from(document.querySelectorAll('a[rel=tag]')).map(
      (a) => a.textContent,
    );
    const aRelCategory = Array.from(
      document.querySelectorAll('a[rel=category]'),
    ).map((a) => a.textContent);

    const jsonLdScripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    ).map((script) => script.textContent);

    // Feeds a single `.includes('dataLayer.push')` test in getKeywords.js --
    // .text (not .textContent) matches the property the offscreen extractor
    // used, and what getKeywords.js's mockDoc-fed closure expects.
    const scripts = Array.from(document.querySelectorAll('script')).map(
      (script) => script.text,
    );

    // GitHub's current topic selectors (updated 2025), same union as before.
    const githubTopics = [
      ...new Set(
        [
          ...Array.from(
            document.querySelectorAll('a[href^="/topics/"] .topic-tag-name'),
          ).map((span) => span.textContent.trim()),
          ...Array.from(document.querySelectorAll('span.topic-tag-name')).map(
            (span) => span.textContent.trim(),
          ),
          ...Array.from(document.querySelectorAll('a[href^="/topics/"]')).map(
            (a) => a.textContent.trim(),
          ),
          ...Array.from(
            document.querySelectorAll('a[class*="topic-tag"]'),
          ).map((a) => a.textContent.trim()),
          ...Array.from(
            document.querySelectorAll(
              'a[data-view-component="true"][title^="Topic:"]',
            ),
          ).map((a) => a.textContent.trim()),
          ...Array.from(
            document.querySelectorAll(
              'a[data-ga-click="Topic, repository page"]',
            ),
          ).map((a) => a.textContent.trim()),
        ].filter(Boolean),
      ),
    ];

    const nextData = document.getElementById('__NEXT_DATA__')?.textContent || '';

    const description = Array.from(
      document.querySelectorAll(
        'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]',
      ),
    )
      .map((meta) => meta.getAttribute('content'))
      .filter(Boolean);

    // Only walk up to headingLevel (input_headings_slider, default 3) rather
    // than always all six -- the offscreen extractor used to grab h1-h6
    // unconditionally regardless of what the user configured.
    const headlineTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const headlines = {};
    headlineTags.forEach((tag, i) => {
      headlines[tag] =
        i < headingLevel
          ? Array.from(document.querySelectorAll(tag)).map((h) => h.textContent)
          : [];
    });

    // The two raw-regex keyword extractors formerly in getKeywords.js, moved
    // here so they run against the live page instead of a full HTML string
    // shipped to the service worker. outerHtml is built, scanned, and
    // discarded entirely inside this page context -- only the small result
    // arrays below cross the structured-clone boundary.
    const outerHtml = document.documentElement.outerHTML;

    let xplKeywords = [];
    const xplRegex = /xplGlobal\.document\.metadata=([^;]*);/g;
    const xplMatch = xplRegex.exec(outerHtml);
    if (xplMatch) {
      try {
        const xplJson = JSON.parse(xplMatch[1]);
        xplJson.keywords.forEach((tags) => {
          tags.kwd.forEach((tag) => xplKeywords.push(tag));
        });
      } catch (e) {
        // leave xplKeywords = []
      }
    }

    let bruteForceKeywords = [];
    const bruteRegex = /keywords:\s*"([^"]*)"/g;
    const bruteMatch = bruteRegex.exec(outerHtml);
    if (bruteMatch) {
      bruteForceKeywords = bruteMatch[1].split(',');
    }

    return {
      metaTags,
      aRelTag,
      aRelCategory,
      jsonLdScripts,
      scripts,
      githubTopics,
      nextData,
      description,
      headlines,
      xplKeywords,
      bruteForceKeywords,
    };
  } catch (error) {
    return { error: error.message };
  }
}
