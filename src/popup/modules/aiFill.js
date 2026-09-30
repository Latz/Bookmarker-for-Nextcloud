// @ts-check
// Fills the tags and the description with the AI's suggestions when the normal
// extraction found none. Runs after the form is shown and never blocks it.
import { getOptions } from '../../lib/storage.js';
import { addKeywordsIfEmpty } from './fillKeywords.js';

/**
 * @param {string} id
 * @returns {HTMLTextAreaElement | null}
 */
const descriptionField = (id) =>
  /** @type {HTMLTextAreaElement | null} */ (document.getElementById(id));

/**
 * Asks the AI for what is missing and puts it into the still empty, untouched
 * fields. Does nothing if the AI is off, nothing is missing, or the request
 * fails.
 * @param {{title?: string, url?: string, keywords?: string[], description?: string}} data
 *   The page data the form was filled with.
 * @returns {Promise<void>}
 */
export async function fillFromAi(data) {
  const options = await getOptions([
    'select_aiProvider',
    'cbx_aiTags',
    'cbx_aiDescription',
    'cbx_showKeywords',
    'cbx_showDescription',
    'cbx_autoDescription',
  ]);
  if (!options.select_aiProvider || options.select_aiProvider === 'off') return;

  const tags =
    options.cbx_aiTags &&
    options.cbx_showKeywords &&
    !(data.keywords?.length > 0);
  const description =
    options.cbx_aiDescription &&
    options.cbx_showDescription &&
    options.cbx_autoDescription &&
    !data.description?.trim();
  if (!tags && !description) return;

  const status = document.createElement('div');
  status.id = 'ai_status';
  status.className = 'text-center text-sm opacity-70';
  status.textContent = chrome.i18n.getMessage('aiSuggesting');
  document.getElementById('formData')?.after(status);
  try {
    const reply = await chrome.runtime.sendMessage({
      msg: 'aiSuggest',
      data: {
        tags,
        description,
        title: data.title,
        url: data.url,
      },
    });
    if (tags && reply?.keywords?.length > 0) {
      addKeywordsIfEmpty(reply.keywords);
    }
    const field = descriptionField('description');
    if (
      description &&
      reply?.description &&
      field &&
      !field.value &&
      field.dataset.touched !== 'true'
    ) {
      field.value = reply.description;
    }
  } finally {
    status.remove();
  }
}
