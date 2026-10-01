// @ts-check
// Once a week: download the model list of the AI provider in use, compare the
// prices again and tell the user if a cheaper model than the selected one
// exists. A chrome.alarms alarm triggers it (see scheduleModelCheck); the
// alarm listener is registered in background.js.
import { listModels } from '../../../lib/aiClient.js';
import { findCheaperModel } from '../../../lib/aiModelCheck.js';
import { getProvider } from '../../../lib/aiProviders.js';
import { getOptions } from '../../../lib/storage.js';
import log from '../../../lib/log.js';
import { applyAutoCheapest, hostPattern } from './autoCheapest.js';
import {
  notifyAutoSwitched,
  notifyCheaperModel,
} from '../browser/notification.js';

const DEBUG = import.meta.env?.MODE === 'development';

export const MODEL_CHECK_ALARM = 'aiModelCheck';
const WEEK_MINUTES = 7 * 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
// An alarm that was missed fires when the browser starts again; a check this
// recent makes it unnecessary.
const MIN_DAYS_BETWEEN_CHECKS = 6;
const STATE_KEY = 'aiModelCheck';

/**
 * @returns {Promise<{time?: number, notified?: {provider: string, model: string, suggested: string}}>}
 */
async function readState() {
  try {
    const stored = await chrome.storage.local.get(STATE_KEY);
    return stored?.[STATE_KEY] ?? {};
  } catch {
    return {};
  }
}

/**
 * @param {object} state
 * @returns {Promise<void>}
 */
async function writeState(state) {
  try {
    await chrome.storage.local.set({ [STATE_KEY]: state });
  } catch {
    // nothing to remember it with: the next check may tell the user again
  }
}

/**
 * Downloads the model list of the provider in use and notifies the user if a
 * cheaper model than the selected one exists. The same suggestion is made only
 * once. Never throws.
 * @returns {Promise<import('../../../lib/aiModelCheck.js').CheaperModel | null>}
 *   The cheaper model, or null (AI off, switched off, no key/permission, list
 *   not loadable, selected model unpriced or already the cheapest).
 */
export async function checkCheaperModel() {
  try {
    const options = await getOptions([
      'select_aiProvider',
      'cbx_aiModelCheck',
      'input_networkTimeout',
    ]);
    const provider = getProvider(options.select_aiProvider);
    if (!provider || options.cbx_aiModelCheck === false) return null;

    const key = (field) => `input_${provider.id}${field}`;
    const own = await getOptions([key('ApiKey'), key('Model'), key('BaseUrl')]);
    const apiKey = own[key('ApiKey')];
    const model = own[key('Model')];
    const baseUrl = own[key('BaseUrl')];
    if (!model || (provider.needsKey && !apiKey)) return null;

    // Without the permission the request would fail anyway
    const pattern = hostPattern(baseUrl);
    if (
      !pattern ||
      !(await chrome.permissions.contains({ origins: [pattern] }))
    ) {
      return null;
    }

    const models = await listModels(
      provider.id,
      apiKey,
      baseUrl,
      options.input_networkTimeout,
    );
    const state = await readState();
    const cheaper = findCheaperModel(provider.id, model, models);
    log(
      DEBUG,
      '[ai] model check:',
      provider.id,
      model,
      '->',
      cheaper?.id ?? 'no cheaper model',
    );

    const already =
      state.notified?.provider === provider.id &&
      state.notified.model === model &&
      state.notified.suggested === cheaper?.id;
    if (cheaper && !already) {
      await notifyCheaperModel({
        provider: provider.label,
        selected: model,
        suggested: cheaper.id,
        selectedPrice: cheaper.selectedPrice,
        suggestedPrice: cheaper.price,
      });
    }
    await writeState({
      time: Date.now(),
      notified: cheaper
        ? { provider: provider.id, model, suggested: cheaper.id }
        : undefined,
    });
    return cheaper;
  } catch (error) {
    console.warn('[ai] model check failed:', error?.message ?? error);
    return null;
  }
}

/**
 * The alarm's job: switches to the cheapest model (option on) or looks for a
 * cheaper one to tell about, unless a check ran only a few days ago.
 * @returns {Promise<void>}
 */
export async function runScheduledModelCheck() {
  const { time } = await readState();
  if (time && Date.now() - time < MIN_DAYS_BETWEEN_CHECKS * DAY_MS) return;

  // With "switch automatically" on, the model is changed instead of the user
  // being told about a cheaper one.
  const { cbx_aiAutoCheapest: auto } = await getOptions(['cbx_aiAutoCheapest']);
  if (auto) {
    const switched = await applyAutoCheapest();
    if (switched) await notifyAutoSwitched(switched);
    await writeState({ time: Date.now() });
    return;
  }
  await checkCheaperModel();
}

/**
 * Makes sure the weekly alarm exists (it can be lost when the browser
 * restarts, so every worker start calls this). The first check comes a few
 * minutes later, then once a week. Never throws.
 * @returns {Promise<void>}
 */
export async function scheduleModelCheck() {
  try {
    if (!chrome.alarms) return;
    if (await chrome.alarms.get(MODEL_CHECK_ALARM)) return;
    chrome.alarms.create(MODEL_CHECK_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: WEEK_MINUTES,
    });
  } catch (error) {
    console.warn('[ai] could not schedule the model check:', error);
  }
}
