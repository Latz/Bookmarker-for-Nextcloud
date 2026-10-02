// The box on the right of the AI tab: for the provider chosen in the dropdown
// a short sentence on its cheap models, its model families from the cheapest
// to the dearest with the cheap ones highlighted (green, yellow -- like in the
// model dropdown), the models the provider really offers sorted into them (once
// the list is loaded), and a link to the provider's own price page.
import { AI_PROVIDERS } from '../lib/aiProviders.js';
import { HINTS, HINTS_AS_OF } from '../lib/aiHints.js';
import { groupByFamily } from '../lib/aiTiers.js';

const MAX_LISTED = 4;

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
 * Fills the box.
 * @param {HTMLElement} container
 * @param {string} providerId - The chosen provider, 'off' for none.
 * @param {string[]} [offered] - The model ids the provider offers, if the list
 *   is loaded.
 */
export function renderHintsBox(container, providerId, offered = []) {
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
  const hint = HINTS.find((candidate) => candidate.id === providerId);
  const provider = AI_PROVIDERS.find(
    (candidate) => candidate.id === providerId,
  );

  if (!hint || !provider) {
    container.replaceChildren(
      node('h3', t('aiHintsTitle'), 'font-medium'),
      node('p', t('aiHintsChoose'), 'mt-2 text-sm opacity-80'),
    );
    return;
  }

  const head = node('div', '', 'flex items-baseline justify-between gap-2');
  head.append(node('h3', provider.label, 'font-medium'));
  if (hint.pricingUrl) {
    const link = node('a', `${t('aiHintsPrices')} ↗`, 'link link-info text-sm');
    link.href = hint.pricingUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    head.append(link);
  }

  const children = [
    node('p', t(`aiHint_${provider.id}`), 'mt-2 text-sm opacity-80'),
  ];

  const groups = groupByFamily(provider.id, offered);
  if (groups.length > 0) {
    const list = node('ul', '', 'mt-3 space-y-2 text-sm');
    for (const { family, models } of groups) {
      const item = node('li', '', 'rounded border-l-4 border-base-300 pl-2');
      item.dataset.tier = String(family.tier);
      const name = family.name ?? t(family.nameKey ?? 'aiFamilyOther');
      const line = node('div', '', 'flex items-baseline justify-between gap-2');
      line.append(
        node('span', name, 'font-medium'),
        node('span', t(`aiTier${family.tier}`), 'text-xs opacity-70'),
      );
      item.append(line);
      if (models.length > 0) {
        const shown = models.slice(0, MAX_LISTED).join(', ');
        const more = models.length - MAX_LISTED;
        item.append(
          node(
            'div',
            more > 0 ? `${shown}, +${more}` : shown,
            'break-all text-xs opacity-70',
          ),
        );
      }
      list.append(item);
    }
    children.push(list);
  }

  children.push(
    node('p', t('aiHintsLegend'), 'mt-3 text-xs'),
    node('p', t('aiHintsNote', [HINTS_AS_OF]), 'mt-1 text-xs opacity-70'),
  );
  container.replaceChildren(head, ...children);
}
