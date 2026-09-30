// Shows the AI usage of the AI tab: requests, input/output tokens and the
// estimated cost per provider and model, with a total and a reset button.
// Re-renders by itself whenever the statistics change (e.g. after a request
// from the popup).
import { AI_PROVIDERS, getProvider } from '../lib/aiProviders.js';
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
 * Sums up usage rows; `unknownCost` is set if a model has no known price.
 * @param {Array<import('../lib/aiUsage.js').ModelUsage>} rows
 */
function sumRows(rows) {
  const total = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    unknownCost: false,
  };
  for (const row of rows) {
    const cost = estimateCost(
      row.provider,
      row.model,
      row.inputTokens,
      row.outputTokens,
    );
    if (cost === null) total.unknownCost = true;
    else total.cost += cost;
    total.requests += row.requests;
    total.inputTokens += row.inputTokens;
    total.outputTokens += row.outputTokens;
  }
  return total;
}

/**
 * A table row with the five usage columns.
 * @param {string} name
 * @param {{requests: number, inputTokens: number, outputTokens: number}} values
 * @param {string} costText
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function usageRow(name, values, costText, className = '') {
  const number = (value) => value.toLocaleString(navigator.language);
  const tr = document.createElement('tr');
  if (className) tr.className = className;
  tr.append(
    cell('td', name),
    cell('td', number(values.requests), 'text-right'),
    cell('td', number(values.inputTokens), 'text-right'),
    cell('td', number(values.outputTokens), 'text-right'),
    cell('td', costText, 'text-right'),
  );
  return tr;
}

/**
 * @param {ReturnType<typeof sumRows>} total
 * @returns {string}
 */
const totalCostText = (total) =>
  `≈ ${formatCost(total.cost)}${total.unknownCost ? '+' : ''}`;

/**
 * The table of one provider: a row per model, and a total row if it has more
 * than one model.
 * @param {Array<import('../lib/aiUsage.js').ModelUsage>} rows
 * @returns {HTMLElement}
 */
function providerTable(rows) {
  const t = (key) => chrome.i18n.getMessage(key);
  const head = document.createElement('tr');
  head.append(
    cell('th', t('aiModel')),
    cell('th', t('aiUsageRequests'), 'text-right'),
    cell('th', t('aiUsageInput'), 'text-right'),
    cell('th', t('aiUsageOutput'), 'text-right'),
    cell('th', t('aiUsageCost'), 'text-right'),
  );
  const thead = document.createElement('thead');
  thead.append(head);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const cost = estimateCost(
      row.provider,
      row.model,
      row.inputTokens,
      row.outputTokens,
    );
    tbody.append(
      usageRow(row.model, row, cost === null ? '–' : `≈ ${formatCost(cost)}`),
    );
  }

  const table = document.createElement('table');
  table.className = 'table table-xs';
  table.append(thead, tbody);
  if (rows.length > 1) {
    const total = sumRows(rows);
    const tfoot = document.createElement('tfoot');
    tfoot.append(
      usageRow(t('aiUsageTotal'), total, totalCostText(total), 'font-medium'),
    );
    table.append(tfoot);
  }
  return table;
}

/**
 * Fills `container` with the current statistics: one section per provider
 * with its models, and a grand total if several providers were used.
 * @param {HTMLElement} container
 * @returns {Promise<void>}
 */
export async function renderAiUsage(container) {
  const t = (key) => chrome.i18n.getMessage(key);
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

  // Providers in the order of the cards; unknown ids (removed providers) last
  const known = AI_PROVIDERS.map((provider) => provider.id);
  const ids = [
    ...known.filter((id) => rows.some((row) => row.provider === id)),
    ...new Set(
      rows.map((row) => row.provider).filter((id) => !known.includes(id)),
    ),
  ];
  const sections = ids.map((id) => {
    const section = document.createElement('section');
    section.className = 'mt-3';
    section.dataset.provider = id;
    section.append(
      cell('h4', getProvider(id)?.label ?? id, 'font-medium text-sm'),
      providerTable(rows.filter((row) => row.provider === id)),
    );
    return section;
  });

  if (ids.length > 1) {
    const total = sumRows(rows);
    const all = document.createElement('table');
    all.className = 'table table-xs mt-3';
    const tbody = document.createElement('tbody');
    tbody.append(
      usageRow(
        t('aiUsageTotalAll'),
        total,
        totalCostText(total),
        'font-medium',
      ),
    );
    all.append(tbody);
    sections.push(all);
  }

  const since = new Date(stats.since).toLocaleDateString(navigator.language);
  const reset = cell('button', t('aiUsageReset'), 'btn btn-xs btn-ghost');
  reset.type = 'button';
  reset.id = 'btn_resetAiUsage';
  reset.addEventListener('click', () => void resetUsage());

  container.replaceChildren(
    heading,
    ...sections,
    cell(
      'p',
      `${t('aiUsageSince')} ${since} · ${t('aiUsageNote')}`,
      'mt-2 text-xs opacity-70',
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
