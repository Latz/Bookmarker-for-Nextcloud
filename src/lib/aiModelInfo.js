// @ts-check
// Details of the AI models (context window, release date, ...), shown in the
// tooltip of the cheapest-models box on the options page. Like the prices they
// are read from the providers' pages when the user updates (priceUpdate.js),
// saved in chrome.storage.local and put into use with setModelInfo (aiData.js);
// there are none built in.

/**
 * @typedef {object} ModelInfo
 * @property {number} [context] - Context window in tokens.
 * @property {number} [maxOutput] - Largest answer in tokens.
 * @property {string} [released] - Release date, YYYY-MM-DD.
 * @property {string} [modalities] - What the model takes as input.
 * @property {string} [description] - One sentence.
 * @property {number} [cachedInput] - Dollars per million cached input tokens.
 * @property {number} [speed] - Output tokens per second (Groq).
 */

/** @type {Record<string, ModelInfo>} */
let current = {};

/**
 * Replaces the details in use.
 * @param {Record<string, ModelInfo> | null | undefined} map - null: none.
 */
export function setModelInfo(map) {
  current = map ?? {};
}

/**
 * @param {string} prefix - A model of the price list.
 * @returns {ModelInfo | null}
 */
export function getModelInfo(prefix) {
  return current[prefix] ?? null;
}
