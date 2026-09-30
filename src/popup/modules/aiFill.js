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

const SVG_NS = 'http://www.w3.org/2000/svg';
// Sparkles: one large and two small four-pointed stars
const SPARKLES_PATH =
  'M9 2l1.6 4.4L15 8l-4.4 1.6L9 14l-1.6-4.4L3 8l4.4-1.6zM17 13l.8 2.2L20 16l-2.2.8L17 19l-.8-2.2L14 16l2.2-.8zM16 2l.6 1.4L18 4l-1.4.6L16 6l-.6-1.4L14 4l1.4-.6z';

/**
 * Marks a field as filled by the AI with a small sparkle icon in its top right
 * corner. The icon sits in a zero-height anchor in front of the field, so it
 * does not change the layout or depend on the field's margins. It disappears
 * as soon as the user edits the field.
 * @param {Element | null} field - The field (for tags: Tagify's element).
 * @param {string[]} editEvents - Events that count as the user's edit.
 */
function markAiFilled(field, editEvents) {
  if (!field) return;
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('viewBox', '0 0 22 22');
  icon.setAttribute('width', '16');
  icon.setAttribute('height', '16');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', SPARKLES_PATH);
  path.setAttribute('fill', 'currentColor');
  icon.append(path);

  const label = chrome.i18n.getMessage('aiFilled');
  const badge = document.createElement('span');
  badge.className =
    'ai-badge absolute right-1.5 top-1.5 z-10 text-red-400 pointer-events-none';
  badge.title = label;
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', label);
  badge.append(icon);
  const anchor = document.createElement('div');
  anchor.className = 'ai-badge-anchor relative h-0';
  anchor.append(badge);
  field.before(anchor);

  const remove = () => anchor.remove();
  for (const name of editEvents) {
    field.addEventListener(name, remove, { once: true });
  }
}

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
  status.className = 'ai-rainbow text-center text-sm leading-10';
  status.textContent = chrome.i18n.getMessage('aiSuggesting');
  // Next to the Save button (in the message area), so nothing below moves
  const host = document.getElementById('sub_message');
  if (host) host.append(status);
  else document.getElementById('formData')?.after(status);
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
      if (addKeywordsIfEmpty(reply.keywords)) {
        markAiFilled(document.querySelector('#formData .tagify'), [
          'keydown',
          'paste',
        ]);
      }
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
      markAiFilled(field, ['input']);
    }
  } finally {
    status.remove();
  }
}
