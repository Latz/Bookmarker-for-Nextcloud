// The box on the right of the AI tab: the cheapest models over all providers,
// cheapest first, with their prices (from the price list in aiPricing.js). A
// click on a row picks that provider and model; an info icon behind the model
// shows what else is known about it (aiModelInfo.js) in a tooltip.
import { AI_PROVIDERS } from '../lib/aiProviders.js';
import { cheapestModels, formatPrice } from '../lib/aiPricing.js';
import { getModelInfo } from '../lib/aiModelInfo.js';

const LIMIT = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';

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
 * "1M", "128K", "1.05M": a token count the short way.
 * @param {number} tokens
 * @returns {string}
 */
export function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${Number((tokens / 1e6).toFixed(2))}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

/**
 * The text of the tooltip: one line per detail that is known.
 * @param {import('../lib/aiModelInfo.js').ModelInfo} info
 * @param {(key: string) => string} t - Translation.
 * @returns {string}
 */
export function modelTooltip(info, t) {
  const lines = [];
  if (info.description) lines.push(info.description);
  const limits = [];
  if (info.context) {
    limits.push(`${t('aiInfoContext')}: ${formatTokens(info.context)}`);
  }
  if (info.maxOutput) {
    limits.push(`${t('aiInfoMaxOutput')}: ${formatTokens(info.maxOutput)}`);
  }
  if (limits.length > 0) lines.push(limits.join(' · '));
  if (info.released) lines.push(`${t('aiInfoReleased')}: ${info.released}`);
  if (info.modalities) lines.push(`${t('aiInfoInputs')}: ${info.modalities}`);
  if (info.cachedInput != null) {
    lines.push(`${t('aiInfoCached')}: $${info.cachedInput} / 1M`);
  }
  if (info.speed) lines.push(`${t('aiInfoSpeed')}: ${info.speed} tokens/s`);
  return lines.join('\n');
}

/**
 * The little (i) icon with the tooltip. A click on it only shows the tooltip,
 * it does not pick the model.
 * @param {string} text - The tooltip.
 * @returns {HTMLElement}
 */
function infoIcon(text) {
  const icon = document.createElement('span');
  icon.className =
    'ml-1 inline-flex shrink-0 cursor-help align-middle opacity-60 hover:opacity-100';
  icon.title = text;
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', text);
  icon.addEventListener('click', (event) => event.stopPropagation());

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '10');
  circle.setAttribute('cy', '10');
  circle.setAttribute('r', '8.5');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '1.6');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '10');
  dot.setAttribute('cy', '6.2');
  dot.setAttribute('r', '1.2');
  dot.setAttribute('fill', 'currentColor');
  const stem = document.createElementNS(SVG_NS, 'path');
  stem.setAttribute('d', 'M10 9v5.2');
  stem.setAttribute('stroke', 'currentColor');
  stem.setAttribute('stroke-width', '1.8');
  stem.setAttribute('stroke-linecap', 'round');
  svg.append(circle, dot, stem);
  icon.append(svg);
  return icon;
}

/**
 * Fills the box. The cheapest model is green and the second cheapest yellow,
 * like in the model dropdowns.
 * @param {HTMLElement} container
 * @param {(providerId: string, model: string) => void} [onPick] - Called when
 *   a row is clicked.
 */
export function renderCheapestModels(container, onPick) {
  const t = (key) => chrome.i18n.getMessage(key);
  const label = (id) => AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;

  const list = node('ol', '', 'mt-2 space-y-1 text-sm');
  cheapestModels(LIMIT).forEach((entry, index) => {
    // The row is the control (a button), so that the info icon can sit inside
    // it without being a button inside a button.
    const item = node(
      'li',
      '',
      'flex cursor-pointer items-baseline justify-between gap-3 rounded px-1 hover:bg-base-300',
    );
    if (index < 2) item.dataset.priceRank = String(index + 1);
    item.dataset.provider = entry.provider;
    item.dataset.model = entry.model;
    item.title = t('aiCheapestPick');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');

    const name = node('span', '', 'min-w-0');
    name.append(node('span', entry.model, 'break-all'));
    const info = getModelInfo(entry.model);
    const tooltip = info ? modelTooltip(info, t) : '';
    if (tooltip) name.append(infoIcon(tooltip));
    name.append(node('span', ` · ${label(entry.provider)}`, 'opacity-60'));

    item.append(
      name,
      node('span', formatPrice(entry.price), 'whitespace-nowrap'),
    );
    const pick = () => onPick?.(entry.provider, entry.model);
    item.addEventListener('click', pick);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pick();
      }
    });
    list.append(item);
  });

  container.replaceChildren(
    node('h3', t('aiCheapest'), 'font-medium'),
    list,
    node('p', t('aiCheapestNote'), 'mt-3 text-xs opacity-70'),
  );
}

/**
 * The refresh icon of the "update now" button.
 * @returns {SVGElement}
 */
function refreshIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'M16.2 8A6.5 6.5 0 0 0 4.5 6.3M3.8 12A6.5 6.5 0 0 0 15.5 13.7M16.5 3.5v4h-4M3.5 16.5v-4h4',
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

/**
 * Adds "last update", "next update" and an update button to the box. The
 * update is the weekly check for cheaper models (it loads the model list of
 * the provider in use, or of all providers with a key when switching
 * automatically); the prices and details in the box come with the extension.
 * @param {HTMLElement} container - The box.
 * @param {object} deps
 * @param {() => Promise<{last: number | null, next: number | null}>} deps.getStatus
 * @param {() => Promise<{switched?: any, cheaper?: any, error?: string}>} deps.runUpdate
 * @returns {() => Promise<void>} Re-reads the times and shows them.
 */
export function addUpdateFooter(container, { getStatus, runUpdate }) {
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
  const when = (time) =>
    time
      ? new Date(time).toLocaleString(navigator.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : t('aiUpdateNone');

  const last = node('span');
  const next = node('div');
  const result = node('div', '', 'opacity-70');
  result.setAttribute('role', 'status');

  const button = node('button', '', 'btn btn-ghost btn-xs btn-circle shrink-0');
  button.type = 'button';
  button.id = 'btn_updateCheapest';
  button.title = t('aiUpdateNow');
  button.setAttribute('aria-label', t('aiUpdateNow'));
  const icon = refreshIcon();
  button.append(icon);

  const top = node('div', '', 'flex items-center justify-between gap-2');
  top.append(last, button);
  const footer = node(
    'div',
    '',
    'mt-3 space-y-0.5 border-t border-base-300 pt-2 text-xs',
  );
  footer.append(top, next, result);
  container.append(footer);

  const refresh = async () => {
    const status = await getStatus();
    last.textContent = `${t('aiUpdateLast')}: ${when(status.last)}`;
    next.textContent = `${t('aiUpdateNext')}: ${when(status.next)}`;
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    icon.classList.add('animate-spin');
    result.textContent = t('aiUpdateRunning');
    try {
      const outcome = await runUpdate();
      if (outcome?.error) result.textContent = outcome.error;
      else if (outcome?.switched) {
        result.textContent = t('aiAutoDone', [
          outcome.switched.model,
          outcome.switched.providerLabel,
        ]);
      } else if (outcome?.cheaper) {
        result.textContent = t('aiUpdateCheaper', [outcome.cheaper.id]);
      } else result.textContent = t('aiUpdateNothing');
    } catch (error) {
      result.textContent = error?.message ?? String(error);
    } finally {
      button.disabled = false;
      icon.classList.remove('animate-spin');
      await refresh();
    }
  });

  return refresh;
}
