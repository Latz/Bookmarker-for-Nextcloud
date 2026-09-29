// @ts-check
import { cacheGet } from '../../lib/cache.js';
import '@yaireo/tagify/dist/tagify.css';

/** @type {Promise<[any, any]>|null} */
let preloaded = null;

// The Tagify instance of the keywords field, and whether the user has worked
// in it. replaceKeywords needs both: it must not wipe what the user typed.
/** @type {any} */
let activeTagify = null;
let editedByUser = false;

// Events the user causes in the field. Tagify's own programmatic changes
// (addTags, removeAllTags) raise none of these DOM events.
const USER_EDIT_EVENTS = ['keydown', 'paste', 'input', 'click', 'drop'];

/**
 * Starts loading Tagify and the cached keyword whitelist.
 *
 * Neither depends on the getData result, so popup.js calls this while the
 * round trip is in flight instead of paying for the import and the IndexedDB
 * read after it. The result is consumed once by fillKeywords; a call without a
 * preceding preload simply loads on demand.
 * @returns {void}
 */
export function preloadKeywordAssets() {
  if (preloaded !== null) return;
  preloaded = loadKeywordAssets();
  // fillKeywords observes the real outcome; this only prevents an unhandled
  // rejection if the popup never gets that far.
  preloaded.catch(() => {});
}

/**
 * Loads Tagify (dynamic import, so it is a separate chunk that is only fetched
 * when the keywords field is shown) and the cached keyword suggestions in
 * parallel.
 * @returns {Promise<[any, any]>} The Tagify module and the cached keyword list
 *   ([] if the cache read failed).
 */
function loadKeywordAssets() {
  return Promise.all([
    import('@yaireo/tagify'),
    (async () => cacheGet('keywords'))().catch((error) => {
      console.error('Error getting cached keywords:', error);
      return [];
    }),
  ]);
}

/**
 * Replaces the tags of the keywords field, e.g. with the tags of the stored
 * bookmark once the server lookup has found the page. Does nothing if there is
 * no field yet, or if the user has already typed in it.
 * @param {Array<string>} [keywords]
 * @returns {boolean} Whether the tags were replaced.
 */
export function replaceKeywords(keywords) {
  if (!activeTagify || editedByUser) return false;
  activeTagify.removeAllTags();
  if (keywords && keywords.length > 0) activeTagify.addTags(keywords);
  return true;
}

/**
 * Turns the keywords input into a Tagify tag field, with the cached keywords
 * of the server as autocomplete suggestions, and adds the keywords extracted
 * from the page as initial tags.
 *
 * @param {Array<string>} [keywords] - Keywords extracted from the page.
 * @returns {Promise<void>}
 */
export default async function fillKeywords(keywords) {
  const tagsInput = document.getElementById('keywords');
  // Bail out before importing Tagify: when the keywords field is hidden the
  // element does not exist, and Tagify is ~78 KB of the popup bundle.
  if (!tagsInput) return;

  // Use the preload started by popup.js if there is one. It is consumed
  // (reset to null) so a later call loads fresh data.
  const assets = preloaded ?? loadKeywordAssets();
  preloaded = null;
  const [{ default: Tagify }, cachedTags] = await assets;

  // Tagify draws its own bordered box; drop the daisyUI input classes so the
  // two do not stack visually.
  tagsInput.classList.remove('input-sm', 'input');

  let tags = cachedTags;

  // Guard against a corrupt cache entry (Tagify needs an array whitelist).
  if (!Array.isArray(tags)) {
    tags = [];
  }

  const tagify = new Tagify(tagsInput, {
    whitelist: tags, // autocomplete suggestions
    backspace: 'edit', // backspace turns the last tag back into editable text
    dropdown: {
      maxItems: 5, // keep the suggestion list short in the small popup
      highlightFirst: true, // Enter accepts the top suggestion
      includeSelectedTags: true, // suggest tags even if already added
    },
  });
  activeTagify = tagify;
  editedByUser = false;
  for (const eventName of USER_EDIT_EVENTS) {
    tagify.DOM?.scope?.addEventListener(eventName, () => {
      editedByUser = true;
    });
  }

  // keep already-added tags matchable in the dropdown even if they weren't
  // in the initial whitelist
  tagify.on('add', ({ detail }) => {
    if (!tagify.whitelist.includes(detail.data.value)) {
      tagify.whitelist.push(detail.data.value);
    }
  });

  // No page keywords: the empty field is ready for manual input.
  if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) {
    return;
  }

  tagify.addTags(keywords);
}
