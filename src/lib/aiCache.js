// @ts-check
// Remembers the AI's suggestions per page, so reopening the popup (or saving
// the same page again) does not ask the AI - and pay for it - a second time.
// Kept in chrome.storage.local: small, on this device only, cleared together
// with the other caches ("Clear cache" on the options page).
import { normalizeUrl } from './urlNormalizer.js';

const STORAGE_KEY = 'aiSuggestionCache';
const MAX_ENTRIES = 100;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week

/**
 * @typedef {object} AiCacheEntry
 * @property {number} time - When the entry was last written (ms).
 * @property {string[]} [keywords]
 * @property {string} [description]
 */

/**
 * @returns {Promise<Record<string, AiCacheEntry>>}
 */
async function readAll() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const all = stored?.[STORAGE_KEY];
  return all && typeof all === 'object' ? all : {};
}

/**
 * @param {string} url
 * @returns {string | null} The cache key, or null for an unusable URL.
 */
function keyOf(url) {
  if (!url) return null;
  try {
    return normalizeUrl(url);
  } catch {
    return null;
  }
}

/**
 * The cached suggestions of a page.
 * @param {string | undefined} url
 * @returns {Promise<AiCacheEntry | null>} null if there are none or they are
 *   too old. Never throws.
 */
export async function getAiCached(url) {
  try {
    const key = keyOf(url ?? '');
    if (!key) return null;
    const entry = (await readAll())[key];
    if (!entry || Date.now() - entry.time > MAX_AGE_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Stores suggestions for a page, merged into what is already cached for it.
 * The oldest entries go once there are more than MAX_ENTRIES. Never throws.
 * @param {string | undefined} url
 * @param {{keywords?: string[], description?: string}} suggestions
 * @returns {Promise<void>}
 */
export async function setAiCached(url, suggestions) {
  try {
    const key = keyOf(url ?? '');
    if (!key || (!suggestions.keywords && !suggestions.description)) return;
    const all = await readAll();
    const now = Date.now();
    all[key] = { ...all[key], ...suggestions, time: now };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => all[a].time - all[b].time)
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((old) => delete all[old]);
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  } catch (error) {
    console.warn('[ai] could not cache suggestions:', error?.message ?? error);
  }
}

/**
 * Forgets all cached suggestions. Never throws.
 * @returns {Promise<void>}
 */
export async function clearAiCache() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // no storage API (tests, unsupported context): nothing to clear
  }
}
