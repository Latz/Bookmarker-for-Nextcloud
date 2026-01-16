import { cacheGet } from '../../lib/cache.js';
import Tagify from '@yaireo/tagify';

export default async function fillKeywords(keywords) {
  const tagsInput = document.getElementById('keywords');
  if (!tagsInput) return;

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
