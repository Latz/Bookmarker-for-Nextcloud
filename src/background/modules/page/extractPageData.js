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
 *   headlines: {h1: string[], h2: string[], h3: string[], h4: string[], h5: string[], h6: string[]},
 *   xplKeywords: string[],
 *   bruteForceKeywords: string[],
 * } | {error: string}}
 */
export function extractPageData(headingLevel) {
  try {
    const metaTags = Array.from(document.querySelectorAll('meta')).map(
      (meta) => ({
        name: meta.getAttribute('name'),
        property: meta.getAttribute('property'),
        itemprop: meta.getAttribute('itemprop'),
        httpEquiv: meta.getAttribute('http-equiv'),
        content: meta.getAttribute('content'),
      }),
    );

    // `~=` matches one token of a space-separated rel list: WordPress themes
    // write rel="category tag", which the exact match `[rel=tag]` misses
    // (https://www.techdirt.com/). The result still feeds the mock document's
    // 'a[rel=tag]' / 'a[rel=category]' selectors.
    const aRelTag = Array.from(document.querySelectorAll('a[rel~="tag"]')).map(
      (a) => a.textContent,
    );
    const aRelCategory = Array.from(
      document.querySelectorAll('a[rel~="category"]'),
    ).map((a) => a.textContent);

    const jsonLdScripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    ).map((script) => script.textContent);

    // Inline script text, capped per script: the regex searches further down
    // run over all of it, and one bundled script can be megabytes.
    // .text (not .textContent) matches the property the offscreen extractor used.
    const MAX_SCRIPT_CHARS = 300000;
    const scriptTexts = Array.from(document.querySelectorAll('script')).map(
      (script) => script.text.slice(0, MAX_SCRIPT_CHARS),
    );

    // Only extractGtmKeywords reads scripts, and only those with a
    // dataLayer.push. The rest (framework state, analytics bundles: often
    // several MB) no longer crosses the structured-clone boundary.
    const scripts = scriptTexts.filter((text) =>
      text.includes('dataLayer.push'),
    );

    // GitHub's current topic selectors (updated 2025), same union as before.
    // The bare a[href^="/topics/"] link matches navigation on other sites too
    // (any site with a /topics/ section), so it is only used on GitHub; the
    // other selectors are GitHub-specific markup and stay unconditional.
    // document.location rather than the `location` global: same object in a
    // page, but it also exists on a bare document (jsdom, the keyword checker).
    const onGithub = /(^|\.)github\.com$/i.test(
      document.location?.hostname ?? '',
    );
    const githubTopics = [
      ...new Set(
        [
          ...Array.from(
            document.querySelectorAll('a[href^="/topics/"] .topic-tag-name'),
          ).map((span) => span.textContent.trim()),
          ...Array.from(document.querySelectorAll('span.topic-tag-name')).map(
            (span) => span.textContent.trim(),
          ),
          ...(onGithub
            ? Array.from(document.querySelectorAll('a[href^="/topics/"]')).map(
                (a) => a.textContent.trim(),
              )
            : []),
          ...Array.from(document.querySelectorAll('a[class*="topic-tag"]')).map(
            (a) => a.textContent.trim(),
          ),
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

    const nextData =
      document.getElementById('__NEXT_DATA__')?.textContent || '';

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
    // shipped to the service worker. Both look for data in inline scripts, so
    // they scan the script texts -- not document.documentElement.outerHTML,
    // which serialised the whole page (megabytes, synchronously on the page's
    // main thread) on every popup open. Only the small result arrays below
    // cross the structured-clone boundary.
    const scriptText = scriptTexts.join('\n');

    let xplKeywords = [];
    // indexOf instead of /xplGlobal\.document\.metadata=([^;]*);/: same result
    // (first occurrence up to the next ';'), but linear on any input.
    const xplPrefix = 'xplGlobal.document.metadata=';
    const xplStart = scriptText.indexOf(xplPrefix);
    const xplEnd =
      xplStart === -1 ? -1 : scriptText.indexOf(';', xplStart + xplPrefix.length);
    if (xplEnd !== -1) {
      try {
        const xplJson = JSON.parse(
          scriptText.slice(xplStart + xplPrefix.length, xplEnd),
        );
        xplJson.keywords.forEach((tags) => {
          tags.kwd.forEach((tag) => xplKeywords.push(tag));
        });
      } catch (e) {
        // leave xplKeywords = []
      }
    }

    // Last-resort search for a keywords property in inline script/config data:
    //   keywords: "a, b"          (JS object literal)
    //   "keywords":"a,b" / "a|b"  (JSON config, e.g. the Guardian, Ars Technica)
    //   "keywords":["a","b"]      (JSON array, e.g. Variety)
    // Empty values ("keywords":"", []) are skipped so a later, real one can win.
    let bruteForceKeywords = [];
    // The value classes are length-bounded. Unbounded, an unclosed `keywords:[`
    // (or a `"` without partner) makes every attempt scan to the end of the
    // text, so a page repeating it 100 000 times costs O(n^2) and freezes its
    // own tab. bruteTries only counts matches, it cannot limit failed attempts.
    const bruteRegex =
      /["']?keywords["']?\s*:\s*(?:"([^"]{0,5000})"|\[([^\]]{0,5000})\])/g;
    let bruteTries = 0;
    for (const bruteMatch of scriptText.matchAll(bruteRegex)) {
      if (++bruteTries > 50) break;
      const found =
        bruteMatch[1] === undefined
          ? Array.from(bruteMatch[2].matchAll(/"([^"]*)"/g), (m) => m[1])
          : bruteMatch[1].split(/[,|]/);
      const cleaned = found.map((k) => k.trim()).filter(Boolean);
      if (cleaned.length > 0) {
        bruteForceKeywords = cleaned;
        break;
      }
    }

    return {
      metaTags,
      aRelTag,
      aRelCategory,
      jsonLdScripts,
      scripts,
      githubTopics,
      nextData,
      headlines,
      xplKeywords,
      bruteForceKeywords,
    };
  } catch (error) {
    return { error: error.message };
  }
}
