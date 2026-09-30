// Builds the AI tab from the provider registry: one card per provider (radio
// group) and one configuration panel per provider, of which only the panel of
// the selected card is visible. Field ids: input_<id>ApiKey / Model / BaseUrl,
// btn_<id>Models, datalist models_<id>.
import { AI_PROVIDERS } from '../lib/aiProviders.js';

/**
 * @param {string} tag
 * @param {Record<string, string>} [attributes]
 * @param {Array<Node | string>} [children]
 * @returns {HTMLElement}
 */
function el(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') element.className = value;
    else element.setAttribute(name, value);
  }
  element.append(...children);
  return element;
}

/**
 * @param {string} label - Label text, already localized.
 * @param {string} id - Id of the field the label belongs to.
 * @param {HTMLElement} field
 * @returns {HTMLElement[]}
 */
function row(label, id, field) {
  return [el('label', { for: id }, [label]), field];
}

/**
 * @param {import('../lib/aiProviders.js').AiProvider} provider
 * @returns {HTMLElement}
 */
function providerPanel(provider) {
  const { id } = provider;
  const t = (key) => chrome.i18n.getMessage(key);
  const text = (name, type = 'text') =>
    el('input', {
      type,
      id: `input_${id}${name}`,
      class: 'input input-sm input-info w-[350px]',
      autocomplete: 'off',
    });
  const model = text('Model');
  model.setAttribute('list', `models_${id}`);
  const refresh = el(
    'button',
    {
      type: 'button',
      id: `btn_${id}Models`,
      class: 'btn btn-sm btn-ghost',
      'aria-label': t('aiRefreshModels'),
    },
    ['↻'],
  );
  const fields = [];
  if (provider.needsKey || id === 'custom') {
    fields.push(
      ...row(
        `${t('aiApiKey')}${provider.needsKey ? '' : ` (${t('aiKeyOptional')})`}`,
        `input_${id}ApiKey`,
        text('ApiKey', 'password'),
      ),
    );
  }
  fields.push(
    ...row(
      t('aiModel'),
      `input_${id}Model`,
      el('div', { class: 'flex items-center gap-2' }, [
        model,
        el('datalist', { id: `models_${id}` }),
        refresh,
      ]),
    ),
    ...row(t('aiBaseUrl'), `input_${id}BaseUrl`, text('BaseUrl')),
  );
  const panel = el(
    'div',
    {
      id: `ai_panel_${id}`,
      class:
        'hidden mt-4 grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-2',
    },
    fields,
  );
  if (id === 'ollama') {
    panel.append(
      el('p', { class: 'col-span-2 text-sm opacity-70' }, [t('aiOllamaHint')]),
    );
  }
  // The key field is optional for Ollama/custom servers; keep the id present
  // so that stored keys and the model loader work for every provider.
  if (!fields.some((f) => f.id === `input_${id}ApiKey`)) {
    panel.append(
      el('input', { type: 'hidden', id: `input_${id}ApiKey`, value: '' }),
    );
  }
  return panel;
}

/**
 * Renders the provider cards and panels.
 * @param {HTMLElement} cards - Container for the radio cards.
 * @param {HTMLElement} panels - Container for the provider panels.
 */
export function renderAiPanel(cards, panels) {
  const entries = [
    { id: 'off', label: chrome.i18n.getMessage('aiProviderOff') },
    ...AI_PROVIDERS,
  ];
  cards.replaceChildren(
    ...entries.map(({ id, label }) =>
      el('label', { class: 'ai-card' }, [
        el('input', {
          type: 'radio',
          name: 'aiProvider',
          value: id,
          class: 'sr-only',
        }),
        el('span', {}, [label]),
      ]),
    ),
  );
  panels.replaceChildren(...AI_PROVIDERS.map(providerPanel));
}

/**
 * Marks the card of `providerId` as selected and shows only its panel.
 * @param {HTMLElement} cards
 * @param {HTMLElement} panels
 * @param {string} providerId
 */
export function showAiProvider(cards, panels, providerId) {
  for (const radio of cards.querySelectorAll('input[type=radio]')) {
    radio.checked = radio.value === providerId;
  }
  for (const panel of panels.children) {
    panel.classList.toggle('hidden', panel.id !== `ai_panel_${providerId}`);
  }
}
