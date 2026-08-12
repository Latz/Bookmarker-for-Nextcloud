// @ts-check
import { cacheGet } from '../../lib/cache.js';

export default async function fillKeywords(keywords) {
  const tagsInput = document.getElementById('keywords');
  // Bail out before importing Tagify: when the keywords field is hidden the
  // element does not exist, and Tagify is ~78 KB of the popup bundle.
  if (!tagsInput) return;

  const { default: Tagify } = await import('@yaireo/tagify');

  tagsInput.classList.remove('input-sm');
  tagsInput.classList.remove('input');

  let tags = [];
  try {
    tags = await cacheGet('keywords');
  } catch (error) {
    console.error('Error getting cached keywords:', error);
  }

  if (!Array.isArray(tags)) {
    tags = [];
  }

  const tagify = new Tagify(tagsInput, {
    whitelist: tags,
    backspace: 'edit',
    dropdown: {
      maxItems: 5,
      highlightFirst: true,
    },
  });

  if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) {
    return;
  }

  tagify.addTags(keywords);
}
