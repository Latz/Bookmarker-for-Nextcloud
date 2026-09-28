// @ts-check
import { cacheGet } from '../../lib/cache.js';
import '@yaireo/tagify/dist/tagify.css';

/** @type {Promise<[any, any]>|null} */
let preloaded = null;

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
  if (preloaded) return;
  preloaded = loadKeywordAssets();
  // fillKeywords observes the real outcome; this only prevents an unhandled
  // rejection if the popup never gets that far.
  preloaded.catch(() => {});
}

function loadKeywordAssets() {
  return Promise.all([
    import('@yaireo/tagify'),
    (async () => cacheGet('keywords'))().catch((error) => {
      console.error('Error getting cached keywords:', error);
      return [];
    }),
  ]);
}

export default async function fillKeywords(keywords) {
  const tagsInput = document.getElementById('keywords');
  // Bail out before importing Tagify: when the keywords field is hidden the
  // element does not exist, and Tagify is ~78 KB of the popup bundle.
  if (!tagsInput) return;

  const assets = preloaded ?? loadKeywordAssets();
  preloaded = null;
  const [{ default: Tagify }, cachedTags] = await assets;

  tagsInput.classList.remove('input-sm', 'input');

  let tags = cachedTags;

  if (!Array.isArray(tags)) {
    tags = [];
  }

  const tagify = new Tagify(tagsInput, {
    whitelist: tags,
    backspace: 'edit',
    dropdown: {
      maxItems: 5,
      highlightFirst: true,
      includeSelectedTags: true,
    },
  });
  // keep already-added tags matchable in the dropdown even if they weren't
  // in the initial whitelist
  tagify.on('add', ({ detail }) => {
    if (!tagify.whitelist.includes(detail.data.value)) {
      tagify.whitelist.push(detail.data.value);
    }
  });

  if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) {
    return;
  }

  tagify.addTags(keywords);
}
