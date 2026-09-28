// @ts-check
import log from '../../../../lib/log.js';

const DEBUG = false;

// Site- and markup-specific keyword sources. Each takes the (mock) document
// and returns the keywords it found, or [] -- getKeywords tries them in order
// and stops at the first that finds any.

// ------------------------------------------------------------------------------
// try <a href="" rel="tag">
// (https://www.lenfestinstitute.org/solution-set/i-canceled-22-digital-newspaper-subscriptions-heres-what-i-learned-about-digital-retention-strategies/)
// ------------------------------------------------------------------------------
/** @returns {Array<string>} */
export function extractRelTagKeywords(document) {
  const keywords = [];
  const relsTag = document.querySelectorAll('a[rel=tag]');
  relsTag.forEach((tag) => keywords.push(tag.textContent));
  return keywords;
}

// ------------------------------------------------
// try <a href="" rel="category">
/** @returns {Array<string>} */
export function extractRelCategoryKeywords(document) {
  const keywords = [];
  const relsCategories = document.querySelectorAll('a[rel=category]');
  relsCategories.forEach((category) => keywords.push(category.textContent));
  return keywords;
}

// ------------------------------------------------------------------------------------------
// Google Tags Manager
// ------------------------------------------------------------------------------------------
// Bounds for the scan below, which runs over untrusted page text.
const MAX_PUSHES_PER_SCRIPT = 20;
const MAX_PUSH_OBJECT_CHARS = 50000;
const PUSH_CALL = 'dataLayer.push(';

/**
 * Returns the `{...}` object literal starting at `start`, or null if it is not
 * closed within MAX_PUSH_OBJECT_CHARS. Braces and parentheses inside string
 * literals do not count, so `"title":"Foo (bar) {baz}"` is handled -- the old
 * `push\((.*?)\)` regex cut the object at the first `)`, and `.` also stopped
 * at line breaks, so multi-line pushes never matched.
 * @param {string} text
 * @param {number} start - Index of the opening `{`.
 * @returns {string|null}
 */
function readBalancedObject(text, start) {
  const limit = Math.min(text.length, start + MAX_PUSH_OBJECT_CHARS);
  let depth = 0;
  let quote = null;
  for (let i = start; i < limit; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}' && --depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Reads `content.keywords` (pipe-separated) from the first dataLayer.push({...})
 * whose JSON parses and carries it. Pages often have several dataLayer.push
 * scripts, and the first is frequently unrelated (consent handling, events
 * with non-JSON arguments), so a call that fails is skipped, not fatal
 * (https://arstechnica.com/).
 * @returns {Array<string>}
 */
export function extractGtmKeywords(document) {
  log(DEBUG, 'Google Tags Manager');
  const nodeList = document.querySelectorAll('script');

  for (const node of nodeList) {
    const script = node.text;
    if (!script?.includes('dataLayer.push')) continue;

    // Each push is located with indexOf and read with a bounded scanner, so the
    // cost is linear in the script size however many unclosed "push(" a
    // hostile page repeats (a lazy regex retried from every one of them).
    let from = 0;
    for (let tried = 0; tried < MAX_PUSHES_PER_SCRIPT; tried++) {
      const call = script.indexOf(PUSH_CALL, from);
      if (call === -1) break;
      from = call + PUSH_CALL.length;

      let start = from;
      while (/\s/.test(script[start] ?? '')) start++;
      if (script[start] !== '{') continue;
      const literal = readBalancedObject(script, start);
      if (!literal) continue;

      try {
        // JSON might be broken, so be careful. Only a bare `undefined` value is
        // replaced, not the word inside a string ("undefined behaviour").
        const json = JSON.parse(
          literal.replace(/([:,[]\s*)undefined(?=\s*[,}\]])/g, '$1"x"'),
        );
        const keywords = json.content.keywords;
        if (typeof keywords === 'string' && keywords.trim()) {
          return keywords.split('|');
        }
      } catch (e) {
        log(DEBUG, 'GTM dataLayer push was not usable JSON, skipping:', e);
      }
    }
  }
  return [];
}

// ------------------------------------------------------------------------------------------
// Github
// ------------------------------------------------------------------------------------------
/** @returns {Array<string>} */
export function extractGithubKeywords(document) {
  log(DEBUG, 'github');
  let keywords = [];
  // GitHub's current topic selectors (updated 2025)
  // Topics are displayed as: <a href="/topics/opencode" class="topic-tag topic-tag-link">opencode</a>
  const selectors = [
    'a[class*="topic-tag"]', // Matches topic-tag class
    'a[data-view-component="true"][title^="Topic:"]', // GitHub's newer structure
    'a[href^="/topics/"]', // Topic links
    'a[data-ga-click="Topic, repository page"]', // Legacy selector (for backward compatibility)
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    log(
      DEBUG,
      `GitHub selector: ${selector}, found ${elements.length} elements`,
    );
    if (elements.length > 0) {
      elements.forEach((el) => {
        const text = el.textContent.trim();
        if (text) {
          keywords.push(text);
        }
      });
      // Stop after finding topics with first successful selector
      if (keywords.length > 0) break;
    }
  }
  log(DEBUG, 'github keywords:', keywords);

  return keywords;
}

// ------------------------------------------------------------------------------------------
// Next.js: props.pageProps.post.tags in __NEXT_DATA__
// ------------------------------------------------------------------------------------------
/** @returns {Array<string>} */
export function extractNextDataKeywords(document) {
  let keywords = [];
  log(DEBUG, 'Next_data');
  let next_data = '';
  try {
    next_data = document.getElementById('__NEXT_DATA__').innerText;
  } catch (e) {
    return [];
  }
  const json = JSON.parse(next_data);
  try {
    const tags = json.props.pageProps.post.tags;
    if (tags) {
      keywords = tags.split(',');
    }
  } catch (e) {
    // __NEXT_DATA__ may legitimately lack a post.tags field on this page
    log(DEBUG, 'No post.tags in __NEXT_DATA__, skipping:', e);
    return [];
  }

  return keywords;
}
