// The box on the right of the AI tab: the cheapest models over all providers,
// cheapest first, with their prices (from the price list in aiPricing.js).
import { AI_PROVIDERS } from '../lib/aiProviders.js';
import { cheapestModels, formatPrice } from '../lib/aiPricing.js';

const LIMIT = 10;

/**
 * @param {string} tag
 * @param {string} [text]
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

/**
 * Fills the box. The cheapest model is green and the second cheapest yellow,
 * like in the model dropdowns.
 * @param {HTMLElement} container
 */
export function renderCheapestModels(container) {
  const t = (key) => chrome.i18n.getMessage(key);
  const label = (id) => AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;

  const list = node('ol', '', 'mt-2 space-y-1 text-sm');
  cheapestModels(LIMIT).forEach((entry, index) => {
    const item = node('li', '', 'flex items-baseline justify-between gap-3');
    if (index < 2) item.dataset.priceRank = String(index + 1);
    const name = node('span', '', 'min-w-0');
    name.append(
      node('span', entry.model, 'break-all'),
      node('span', ` · ${label(entry.provider)}`, 'opacity-60'),
    );
    item.append(
      name,
      node('span', formatPrice(entry.price), 'whitespace-nowrap'),
    );
    list.append(item);
  });

  container.replaceChildren(
    node('h3', t('aiCheapest'), 'font-medium'),
    list,
    node('p', t('aiCheapestNote'), 'mt-3 text-xs opacity-70'),
  );
}
