// @ts-check
// When the weekly check for cheaper AI models (src/background/modules/ai/
// modelCheck.js) last ran and when it runs next -- read by the options page,
// which shows both next to the cheapest models.

export const MODEL_CHECK_ALARM = 'aiModelCheck';
// Where the check remembers when it ran (chrome.storage.local)
export const MODEL_CHECK_STATE_KEY = 'aiModelCheck';

/**
 * @returns {Promise<{last: number | null, next: number | null}>} Milliseconds
 *   since the epoch; null if the check never ran / no alarm is set. Never
 *   throws.
 */
export async function getCheckStatus() {
  let last = null;
  let next = null;
  try {
    const stored = await chrome.storage.local.get(MODEL_CHECK_STATE_KEY);
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
  return { last, next };
}
