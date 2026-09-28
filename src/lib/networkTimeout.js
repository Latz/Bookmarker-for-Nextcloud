// @ts-check
// Bounds for the network timeout setting (seconds), shared by the options page
// (what may be stored) and apiCall (what is used, whatever is stored).

export const DEFAULT_TIMEOUT_SECONDS = 10;
export const MIN_TIMEOUT_SETTING = 1;
export const MAX_TIMEOUT_SECONDS = 120;

/**
 * Turns whatever is stored for the timeout into milliseconds for fetch.
 * A missing, non-numeric, zero or negative value (a negative timeout aborts
 * every request immediately) falls back to the default; an enormous one is
 * capped so a typo cannot make the popup hang for hours.
 * Fractions are kept, only bounds are applied.
 * @param {unknown} seconds
 * @returns {number} Milliseconds.
 */
export function timeoutMilliseconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_SECONDS * 1000;
  }
  return Math.min(value, MAX_TIMEOUT_SECONDS) * 1000;
}

/**
 * Validates a value typed into the options page.
 * @param {unknown} input
 * @returns {number | null} Whole seconds within bounds, or null if not a number
 *   (an empty field is not stored).
 */
export function clampTimeoutSetting(input) {
  const value = Number.parseInt(String(input), 10);
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, MIN_TIMEOUT_SETTING), MAX_TIMEOUT_SECONDS);
}
