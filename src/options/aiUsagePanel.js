// Shows the AI usage of the AI tab: requests, input/output tokens and the
// estimated cost per provider and model, with a total and a reset button.
// Re-renders by itself whenever the statistics change (e.g. after a request
// from the popup).
import { getProvider } from '../lib/aiProviders.js';
import { estimateCost } from '../lib/aiPricing.js';
import { getUsage, resetUsage, USAGE_STORAGE_KEY } from '../lib/aiUsage.js';

/**
 * @param {string} tag
 * @param {string} [text]
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function cell(tag, text = '', className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

/**
 * Dollar amount with as many decimals as needed to see small sums.
 * @param {number} dollars
 * @returns {string}
 */
export function formatCost(dollars) {
  const digits = dollars >= 1 ? 2 : dollars >= 0.01 ? 3 : 4;
  return `$${dollars.toLocaleString(navigator.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`;
}

/**
 * Fills `container` with the current statistics.
 * @param {HTMLElement} container
 * @returns {Promise<void>}
 */
export async function renderAiUsage(container) {
  const t = (key) => chrome.i18n.getMessage(key);
  const number = (value) => value.toLocaleString(navigator.language);
  const stats = await getUsage();
  const rows = Object.values(stats.models).sort(
    (a, b) => b.requests - a.requests,
  );

  const heading = cell('h3', t('aiUsage'), 'font-medium');
  if (rows.length === 0) {
    container.replaceChildren(
      heading,
      cell('p', t('aiUsageEmpty'), 'text-sm opacity-70'),
    );
    return;
  }

  const head = document.createElement('tr');
  head.append(
    cell('th', t('aiModel')),
    cell('th', t('aiUsageRequests'), 'text-right'),
    cell('th', t('aiUsageInput'), 'text-right'),
    cell('th', t('aiUsageOutput'), 'text-right'),
    cell('th', t('aiUsageCost'), 'text-right'),
  );

  let totalCost = 0;
  let unknownCost = false;
  const total = { requests: 0, inputTokens: 0, outputTokens: 0 };
  const body = rows.map((row) => {
    const cost = estimateCost(
      row.provider,
      row.model,
      row.inputTokens,
      row.outputTokens,
    );
    if (cost === null) unknownCost = true;
    else totalCost += cost;
    total.requests += row.requests;
    total.inputTokens += row.inputTokens;
    total.outputTokens += row.outputTokens;
    const tr = document.createElement('tr');
    const name = `${getProvider(row.provider)?.label ?? row.provider} · ${row.model}`;
    tr.append(
      cell('td', name),
      cell('td', number(row.requests), 'text-right'),
      cell('td', number(row.inputTokens), 'text-right'),
      cell('td', number(row.outputTokens), 'text-right'),
      cell('td', cost === null ? '–' : `≈ ${formatCost(cost)}`, 'text-right'),
    );
    return tr;
  });

  const foot = document.createElement('tr');
  foot.className = 'font-medium';
  foot.append(
    cell('td', t('aiUsageTotal')),
    cell('td', number(total.requests), 'text-right'),
    cell('td', number(total.inputTokens), 'text-right'),
    cell('td', number(total.outputTokens), 'text-right'),
    cell(
      'td',
      `≈ ${formatCost(totalCost)}${unknownCost ? '+' : ''}`,
      'text-right',
    ),
  );

  const table = document.createElement('table');
  table.className = 'table table-xs';
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  tbody.append(...body);
  const tfoot = document.createElement('tfoot');
  tfoot.append(foot);
  table.append(thead, tbody, tfoot);

  const since = new Date(stats.since).toLocaleDateString(navigator.language);
  const reset = cell('button', t('aiUsageReset'), 'btn btn-xs btn-ghost');
  reset.type = 'button';
  reset.id = 'btn_resetAiUsage';
  reset.addEventListener('click', () => void resetUsage());

  container.replaceChildren(
    heading,
    table,
    cell(
      'p',
      `${t('aiUsageSince')} ${since} · ${t('aiUsageNote')}`,
      'mt-1 text-xs opacity-70',
    ),
    reset,
  );
}

/**
 * Renders the statistics now and whenever they change.
 * @param {HTMLElement} container
 */
export function initAiUsage(container) {
  void renderAiUsage(container);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && USAGE_STORAGE_KEY in changes) {
      void renderAiUsage(container);
    }
  });
}
