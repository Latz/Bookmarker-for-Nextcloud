// @ts-check
// The prices and model details the extension uses. There are none built in:
// they are what the extension saved in chrome.storage.local after reading the
// providers' pages (src/background/modules/ai/priceUpdate.js).
import { setPrices } from './aiPricing.js';
import { setModelInfo } from './aiModelInfo.js';

export const AI_DATA_KEY = 'aiData';

const MAX_MODELS = 2000;
const MAX_TEXT = 600;
const NUMBER_FIELDS = ['context', 'maxOutput', 'cachedInput', 'speed'];
const TEXT_FIELDS = ['released', 'modalities', 'description'];

/**
 * @typedef {object} AiData
 * @property {Array<[string, number, number]>} prices
 * @property {Record<string, Record<string, unknown>>} info
 * @property {string} generated - Day the data was read, YYYY-MM-DD.
 * @property {number} [fetched] - When it was saved (ms).
 */

const isPositive = (value) => Number.isFinite(value) && value > 0;

/**
 * Checks data read from the storage or from the pages: nothing else gets into
 * the prices in use.
 * @param {any} data
 * @returns {{ok: true, data: AiData} | {ok: false, error: string}}
 */
export function validateAiData(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'no data' };
  }
  const { prices, info, generated } = data;
  if (!Array.isArray(prices) || prices.length > MAX_MODELS) {
    return { ok: false, error: 'prices missing or too many' };
  }
  for (const entry of prices) {
    if (
      !Array.isArray(entry) ||
      typeof entry[0] !== 'string' ||
      !entry[0] ||
      !isPositive(entry[1]) ||
      !isPositive(entry[2])
    ) {
      return { ok: false, error: 'bad price entry' };
    }
  }
  /** @type {Record<string, Record<string, unknown>>} */
  const cleanInfo = {};
  for (const [model, details] of Object.entries(info ?? {})) {
    if (!details || typeof details !== 'object') {
      return { ok: false, error: 'bad model details' };
    }
    /** @type {Record<string, unknown>} */
    const clean = {};
    for (const field of NUMBER_FIELDS) {
      const value = /** @type {any} */ (details)[field];
      if (value == null) continue;
      if (!isPositive(value)) return { ok: false, error: `bad ${field}` };
      clean[field] = value;
    }
    for (const field of TEXT_FIELDS) {
      const value = /** @type {any} */ (details)[field];
      if (value == null) continue;
      if (typeof value !== 'string')
        return { ok: false, error: `bad ${field}` };
      clean[field] = value.slice(0, MAX_TEXT);
    }
    cleanInfo[model] = clean;
  }
  if (Object.keys(cleanInfo).length > MAX_MODELS) {
    return { ok: false, error: 'too many model details' };
  }
  return {
    ok: true,
    data: {
      prices: prices.map(([p, i, o]) => [p, i, o]),
      info: cleanInfo,
      generated: typeof generated === 'string' ? generated.slice(0, 10) : '',
      fetched: Number.isFinite(data.fetched) ? data.fetched : undefined,
    },
  };
}

/**
 * Puts saved data into use.
 * @param {AiData | null} data - null: no prices and no details.
 */
export function applyAiData(data) {
  setPrices(data?.prices ?? null);
  setModelInfo(data?.info ?? null);
}

/**
 * @returns {Promise<AiData | null>} The saved data, null if there is none or
 *   it is not valid (then there are no prices). Never throws.
 */
export async function readSavedAiData() {
  try {
    const stored = await chrome.storage.local.get(AI_DATA_KEY);
    const checked = validateAiData(stored?.[AI_DATA_KEY]);
    return checked.ok ? checked.data : null;
  } catch {
    return null;
  }
}

let watching = false;

/**
 * Puts the saved data into use and keeps doing so when it changes (the
 * service worker saves it while the options page is open, and the other way
 * round). Call before the prices are used.
 * @returns {Promise<AiData | null>}
 */
export async function loadAiData() {
  const data = await readSavedAiData();
  applyAiData(data);
  if (!watching && chrome.storage?.onChanged) {
    watching = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && AI_DATA_KEY in changes) {
        const checked = validateAiData(changes[AI_DATA_KEY].newValue);
        applyAiData(checked.ok ? checked.data : null);
      }
    });
  }
  return data;
}

/**
 * Saves data (after checking it) and puts it into use.
 * @param {{prices: Array<[string, number, number]>, info: Record<string, any>, generated: string}} data
 * @returns {Promise<void>}
 * @throws {Error} If the data is not valid.
 */
export async function saveAiData(data) {
  const checked = validateAiData(data);
  if (!checked.ok) throw new Error(checked.error);
  const saved = { ...checked.data, fetched: Date.now() };
  await chrome.storage.local.set({ [AI_DATA_KEY]: saved });
  applyAiData(saved);
}
