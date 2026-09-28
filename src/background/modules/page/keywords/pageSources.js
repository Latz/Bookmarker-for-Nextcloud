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
// Upper bound on push( calls tried per script (see the scan bound below).
const MAX_PUSHES_PER_SCRIPT = 20;

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

    // Bound the scan: an untrusted page with many unclosed "push("
    // occurrences would otherwise make the lazy quantifier retry from
    // every one of them, an O(n^2) cost on attacker-controlled input.
    const boundedScript = script.length > 5000 ? script.slice(0, 5000) : script;
    let tried = 0;
    for (const match of boundedScript.matchAll(/push\((.*?)\)/g)) {
      if (++tried > MAX_PUSHES_PER_SCRIPT) break;
      try {
        // JSON might be broken, so be careful
        const json = JSON.parse(match[1].replaceAll('undefined', '"x"'));
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
