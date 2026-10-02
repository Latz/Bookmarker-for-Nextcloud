// @ts-check
// Which models of a provider are the cheap ones, by the family in their name --
// the same statements as the hints box (aiHints.js), as patterns, so the model
// dropdowns can colour them: tier 1 (green) the cheapest family, tier 2
// (yellow) the next cheapest. There are no prices in the extension; a model of
// a family not listed here (a new name) is not coloured.

/** @type {Record<string, RegExp[]>} Provider id -> [cheapest, next cheapest]. */
const TIERS = {
  claude: [/haiku/i, /sonnet/i],
  openai: [/nano/i, /mini/i],
  // "flash-lite" must come before "flash", which it contains
  gemini: [/flash-lite/i, /flash/i],
  mistral: [/ministral|small/i, /large/i],
  groq: [/gpt-oss-20b/i, /gpt-oss/i],
  deepseek: [/flash/i, /pro/i],
  openrouter: [/:free$/i],
};

/**
 * @param {string} providerId
 * @param {string} model - Model id as the provider's API names it.
 * @returns {0 | 1 | 2} 1: the cheapest family, 2: the next cheapest, 0: other
 *   or unknown.
 */
export function modelTier(providerId, model) {
  const patterns = TIERS[providerId] ?? [];
  const index = patterns.findIndex((pattern) => pattern.test(String(model)));
  return index === -1 ? 0 : /** @type {1 | 2} */ (index + 1);
}
