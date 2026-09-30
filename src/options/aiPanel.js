// Builds the AI tab from the provider registry: one card per provider (radio
// group) and one configuration panel per provider, of which only the panel of
// the selected card is visible. Field ids: input_<id>ApiKey / Model / BaseUrl,
// btn_<id>Models, btn_<id>Test, ai_test_<id> (test result); the model field
// is a dropdown, or an input with datalist models_<id> (freeModel providers).
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

const SVG_NS = 'http://www.w3.org/2000/svg';
// Eye drawn like the Dashicons "visibility" icon of the WordPress login; the
// slash is shown while the key is visible ("hidden" icon = click to hide).
const EYE_PATH =
  'M10 4.4C3.6 4.4 0 10 0 10s3.6 5.6 10 5.6 10-5.6 10-5.6-3.6-5.6-10-5.6zm0 9.4c-2.1 0-3.8-1.7-3.8-3.8S7.9 6.2 10 6.2s3.8 1.7 3.8 3.8-1.7 3.8-3.8 3.8zM10 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z';
const SLASH_PATH = 'M3 2.5l14 15';

/** @returns {SVGElement} */
function eyeIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  const eye = document.createElementNS(SVG_NS, 'path');
  eye.setAttribute('d', EYE_PATH);
  eye.setAttribute('fill', 'currentColor');
  eye.setAttribute('fill-rule', 'evenodd');
  const slash = document.createElementNS(SVG_NS, 'path');
  slash.setAttribute('d', SLASH_PATH);
  slash.setAttribute('class', 'ai-eye-slash hidden');
  slash.setAttribute('stroke', 'currentColor');
  slash.setAttribute('stroke-width', '1.8');
  slash.setAttribute('stroke-linecap', 'round');
  svg.append(eye, slash);
  return svg;
}

/**
 * Wraps a password input with a WordPress-style show/hide button.
 * @param {HTMLElement} input
 * @returns {HTMLElement}
 */
function secretField(input) {
  const t = (key) => chrome.i18n.getMessage(key);
  input.classList.remove('w-[350px]');
  input.classList.add('w-full', 'pr-10');
  const button = el(
    'button',
    {
      type: 'button',
      class: 'ai-eye',
      'aria-label': t('aiShowKey'),
      'aria-pressed': 'false',
    },
    [eyeIcon()],
  );
  button.addEventListener('click', () => {
    const show = input.type === 'password';
    setSecretVisible(input, button, show);
  });
  return el('div', { class: 'relative w-[350px]' }, [input, button]);
}

/**
 * @param {HTMLElement} input
 * @param {HTMLElement} button
 * @param {boolean} show
 */
function setSecretVisible(input, button, show) {
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
  button.setAttribute(
    'aria-label',
    chrome.i18n.getMessage(show ? 'aiHideKey' : 'aiShowKey'),
  );
  button.querySelector('.ai-eye-slash')?.classList.toggle('hidden', !show);
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
 * Sets the models offered by a model field: the options of a dropdown (the
 * current value always stays selectable) or the suggestions of a text input.
 * @param {HTMLElement} field - The `input_<id>Model` element.
 * @param {Array<{id: string, label: string}>} models
 * @param {string} [current] - Model that stays selected; default: the field's.
 */
export function setModelOptions(field, models, current = field.value) {
  const entries = [...models];
  if (
    field.tagName === 'SELECT' &&
    current &&
    !entries.some((model) => model.id === current)
  ) {
    entries.unshift({ id: current, label: current });
  }
  const options = entries.map((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    return option;
  });
  if (field.tagName === 'SELECT') {
    field.replaceChildren(...options);
    field.value = current;
  } else {
    document
      .getElementById(field.getAttribute('list'))
      ?.replaceChildren(...options);
  }
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
  // Ollama/custom servers may offer no model list, so their model is typed in
  // (with list suggestions); the others pick from a dropdown.
  let model;
  if (provider.freeModel) {
    model = text('Model');
    model.setAttribute('list', `models_${id}`);
  } else {
    model = el('select', {
      id: `input_${id}Model`,
      class: 'select select-sm select-info w-[350px]',
    });
    setModelOptions(model, [], provider.defaultModel);
  }
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
        secretField(text('ApiKey', 'password')),
      ),
    );
  }
  fields.push(
    ...row(
      t('aiModel'),
      `input_${id}Model`,
      el('div', { class: 'flex items-center gap-2' }, [
        model,
        ...(provider.freeModel ? [el('datalist', { id: `models_${id}` })] : []),
        refresh,
      ]),
    ),
    ...row(t('aiBaseUrl'), `input_${id}BaseUrl`, text('BaseUrl')),
    el('span'),
    el('div', { class: 'flex items-center gap-3' }, [
      el(
        'button',
        {
          type: 'button',
          id: `btn_${id}Test`,
          class: 'btn btn-sm btn-info btn-outline',
        },
        [t('aiTest')],
      ),
      el('span', { id: `ai_test_${id}`, class: 'text-sm', role: 'status' }),
    ]),
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
  if (!panel.querySelector(`#input_${id}ApiKey`)) {
    panel.append(
      el('input', { type: 'hidden', id: `input_${id}ApiKey`, value: '' }),
    );
  }
  // This provider's usage statistics (filled by aiUsagePanel.js)
  panel.append(
    el('div', {
      id: `ai_usage_${id}`,
      class:
        'col-span-2 mt-4 max-w-xl rounded-box border border-base-300 bg-base-200 p-3',
    }),
  );
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
  for (const input of panels.querySelectorAll('input[id$=ApiKey]')) {
    const button = input.parentElement?.querySelector('.ai-eye');
    if (button) setSecretVisible(input, button, false);
  }
  for (const panel of panels.children) {
    panel.classList.toggle('hidden', panel.id !== `ai_panel_${providerId}`);
  }
}
