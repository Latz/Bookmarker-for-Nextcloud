// @ts-check
// When the weekly check for cheaper AI models (src/background/modules/ai/
// modelCheck.js) last ran and when it runs next -- read by the options page,
// which shows both next to the cheapest models, together with the day the
// prices were read from the providers' pages.
import { AI_DATA_KEY } from './aiData.js';

export const MODEL_CHECK_ALARM = 'aiModelCheck';
// Where the check remembers when it ran (chrome.storage.local)
export const MODEL_CHECK_STATE_KEY = 'aiModelCheck';

/**
 * @returns {Promise<{last: number | null, next: number | null, prices: string | null}>}
 *   Milliseconds since the epoch; null if the check never ran / no alarm is
 *   set. `prices`: the day the saved prices were read (YYYY-MM-DD), null if
 *   the built-in ones are in use. Never throws.
 */
export async function getCheckStatus() {
  let last = null;
  let next = null;
  let prices = null;
  try {
    const stored = await chrome.storage.local.get([
      MODEL_CHECK_STATE_KEY,
      AI_DATA_KEY,
    ]);
    const generated = stored?.[AI_DATA_KEY]?.generated;
    if (typeof generated === 'string' && generated) prices = generated;
    const time = stored?.[MODEL_CHECK_STATE_KEY]?.time;
    if (Number.isFinite(time) && time > 0) last = time;
  } catch {
    // no storage: unknown
  }
  try {
    const alarm = await chrome.alarms?.get(MODEL_CHECK_ALARM);
    if (Number.isFinite(alarm?.scheduledTime)) next = alarm.scheduledTime;
  } catch {
    // no alarms: unknown
  }
  return { last, next, prices };
}
