// @ts-check
// Reads the prices and details of the AI models from the providers' own pages
// (the same seven pages the pricing checker in tools/ai-pricing-check reads),
// and saves what changed in chrome.storage.local (src/lib/aiData.js), where
// the cheapest-models box, the model dropdowns, the cost statistics and the
// automatic switch find it. Runs with the weekly check and on "update now".
import { loadAiData, saveAiData } from '../../../lib/aiData.js';
import { getModelInfo } from '../../../lib/aiModelInfo.js';
import { collectInfo, compare } from '../../../lib/aiPriceMerge.js';
import { getPricesList } from '../../../lib/aiPricing.js';
import { SOURCES, sourceOrigin } from '../../../lib/aiPriceSources.js';
import { ensureOffscreenDocument } from '../browser/getBrowserTheme.js';

/**
 * @typedef {object} PriceUpdate
 * @property {boolean} ok - At least one source was read.
 * @property {string} [reason] - 'permission': no source may be read yet.
 * @property {string} [error]
 * @property {number} [changed] - Prices that changed.
 * @property {number} [added] - New models.
 * @property {number} [infoChanged] - Models whose details changed.
 * @property {number} [suspicious] - Changes of more than 10x, not taken.
 * @property {string[]} [failed] - Sources that were permitted but not readable.
 * @property {string[]} [skipped] - Sources without host permission.
 * @property {string} [generated] - Day of this reading, YYYY-MM-DD.
 */

/**
 * Reads the permitted sources, and saves new and changed prices and details.
 * Nothing is ever removed: a model the pages do not list (any more) keeps its
 * price. A source that fails leaves its models as they are. Never throws.
 * @returns {Promise<PriceUpdate>}
 */
export async function updatePrices() {
  try {
    await loadAiData();

    // Only pages the user has allowed (the options page asks for them on
    // "update now"); the weekly job takes what it is given.
    const permitted = [];
    const skipped = [];
    for (const source of SOURCES) {
      const allowed = await chrome.permissions.contains({
        origins: [sourceOrigin(source)],
      });
      (allowed ? permitted : skipped).push(source);
    }
    if (permitted.length === 0) {
      return {
        ok: false,
        reason: 'permission',
        skipped: skipped.map((s) => s.name),
      };
    }

    await ensureOffscreenDocument();
    const read = await Promise.all(
      permitted.map(async (source) => {
        try {
          return await chrome.runtime.sendMessage({
            target: 'offscreen',
            msg: 'readPriceSource',
            name: source.name,
          });
        } catch (error) {
          return {
            name: source.name,
            url: source.url,
            official: source.official,
            rows: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    const sources = read.map((result, index) => ({
      official: permitted[index].official,
      ...result,
    }));
    const failed = sources.filter((source) => source.error).map((s) => s.name);
    if (failed.length === sources.length) {
      return { ok: false, failed, skipped: skipped.map((s) => s.name) };
    }

    const current = getPricesList();
    const report = compare(sources, current);
    const next = new Map(current.map((entry) => [entry[0], [...entry]]));
    let suspicious = 0;
    for (const row of report.changed) {
      if (row.suspicious) suspicious++;
      else next.set(row.prefix, [row.prefix, row.input, row.output]);
    }
    for (const row of report.added) {
      next.set(row.prefix, [row.prefix, row.input, row.output]);
    }

    const collected = collectInfo(sources, new Set(next.keys()));
    /** @type {Record<string, any>} */
    const info = {};
    let infoChanged = 0;
    for (const prefix of next.keys()) {
      const before = getModelInfo(prefix);
      const merged = { ...before, ...collected[prefix] };
      if (Object.keys(merged).length === 0) continue;
      info[prefix] = merged;
      if (JSON.stringify(merged) !== JSON.stringify(before ?? {}))
        infoChanged++;
    }

    // Saved even if nothing changed: "prices as of" then says that they were
    // checked today.
    const generated = new Date().toISOString().slice(0, 10);
    await saveAiData({ prices: [...next.values()], info, generated });
    return {
      ok: true,
      changed: report.changed.length - suspicious,
      added: report.added.length,
      infoChanged,
      suspicious,
      failed,
      skipped: skipped.map((s) => s.name),
      generated,
    };
  } catch (error) {
    console.warn('[ai] price update failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
