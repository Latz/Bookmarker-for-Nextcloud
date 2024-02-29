import { cacheGet } from '../../lib/cache.js';
import Tagify from '@yaireo/tagify';

export default async function fillKeywords(keywords) {
  const tagsInput = document.getElementById('keywords');
  tagsInput.classList.remove('input-sm');
  tagsInput.classList.remove('input');
  const tags = await cacheGet('keywords');

  const tagify = new Tagify(tagsInput, {
    whitelist: tags,
    backspace: 'edit',
    dropdown: {
      maxItems: 5,
      highlightFirst: true,
    },
  });
  if (keywords && keywords.length === 0) return;
  tagify.addTags(keywords);
}
