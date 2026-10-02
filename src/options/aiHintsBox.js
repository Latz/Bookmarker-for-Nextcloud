// The box on the right of the AI tab: for every provider a short sentence on
// which of its models are the cheap ones (src/lib/aiHints.js). The provider
// that is chosen in the dropdown is marked.
import { AI_PROVIDERS } from '../lib/aiProviders.js';
import { HINTS, HINTS_AS_OF } from '../lib/aiHints.js';

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
 */
export function renderHintsBox(container) {
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
  const label = (id) => AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;

  const sections = HINTS.map((hint) => {
    const section = node(
      'section',
      '',
      'border-l-2 border-transparent pl-2 transition-colors',
    );
    section.dataset.provider = hint.id;

    const head = node('div', '', 'flex items-baseline justify-between gap-2');
    head.append(node('h4', label(hint.id), 'font-medium'));
    if (hint.pricingUrl) {
      const link = node(
        'a',
        `${t('aiHintsPrices')} ↗`,
        'link link-info text-xs',
      );
      link.href = hint.pricingUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      head.append(link);
    }
    section.append(
      head,
      node('p', t(`aiHint_${hint.id}`), 'text-sm opacity-80'),
    );
    return section;
  });

  container.replaceChildren(
    node('h3', t('aiHintsTitle'), 'font-medium'),
    node('div', '', 'mt-2 space-y-3'),
    node('p', t('aiHintsLegend'), 'mt-3 text-xs'),
    node('p', t('aiHintsNote', [HINTS_AS_OF]), 'mt-1 text-xs opacity-70'),
  );
  container.children[1].append(...sections);
}

/**
 * Marks the section of the provider that is chosen ("off": none).
 * @param {HTMLElement} container
 * @param {string} providerId
 */
export function markChosenProvider(container, providerId) {
  for (const section of container.querySelectorAll('section[data-provider]')) {
    const chosen = section.dataset.provider === providerId;
    section.classList.toggle('border-info', chosen);
    section.classList.toggle('border-transparent', !chosen);
    if (chosen) section.setAttribute('aria-current', 'true');
    else section.removeAttribute('aria-current');
  }
}
