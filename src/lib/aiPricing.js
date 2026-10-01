// @ts-check
// The prices (US dollars per million tokens) of the AI models, to estimate what
// the AI calls cost and to rank the models. The extension has NO built-in
// prices: they are read from the providers' own pages when the user updates
// them (src/background/modules/ai/priceUpdate.js), saved in chrome.storage.local
// and put into use with setPrices (see aiData.js). Without them no model has a
// price: costs show "-", the cheapest-models box asks for an update.
// A model matches the longest prefix of its id (so dated ids like
// "claude-haiku-4-5-20251001" find "claude-haiku-4-5").

// The prices in use: those the extension read from the providers' pages and
// saved (see aiData.js); none before that.
/** @type {Array<[prefix: string, input: number, output: number]>} */
let current = [];

// Longest prefix first, so "gpt-5-mini" wins over "gpt-5".
const byLength = (list) => [...list].sort((a, b) => b[0].length - a[0].length);
let SORTED = byLength(current);

/**
 * Replaces the prices in use.
 * @param {Array<[string, number, number]> | null | undefined} list - null or
 *   an empty list: no model has a price.
 */
export function setPrices(list) {
  current = Array.isArray(list) ? list : [];
  SORTED = byLength(current);
}

/** @returns {Array<[string, number, number]>} The prices in use. */
export function getPricesList() {
  return current;
}

// Local servers cost nothing per token.
const FREE_PROVIDERS = new Set(['ollama']);

/**
 * @param {string} provider - Provider id.
 * @param {string} model
 * @returns {{input: number, output: number} | null} Dollars per million
 *   tokens, or null if the model is not known.
 */
export function getPrice(provider, model) {
  if (FREE_PROVIDERS.has(provider)) return { input: 0, output: 0 };
  // OpenRouter ids carry the vendor: "openai/gpt-5-mini"
  const id = String(model).toLowerCase().replace(/^.*\//, '');
  const hit = SORTED.find(([prefix]) => id.startsWith(prefix));
  return hit ? { input: hit[1], output: hit[2] } : null;
}

/**
 * @param {string} provider
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number | null} Estimated cost in US dollars, null if unknown.
 */
export function estimateCost(provider, model, inputTokens, outputTokens) {
  const price = getPrice(provider, model);
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * "$0.25 / $2" -- input / output price per million tokens, for the model
 * dropdowns. Whole dollars have no decimals, others at least two.
 * @param {{input: number, output: number}} price
 * @returns {string}
 */
export function formatPrice(price) {
  const dollars = (value) =>
    `$${value.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 4,
    })}`;
  return `${dollars(price.input)} / ${dollars(price.output)}`;
}

// This extension sends a lot more text than it gets back: the page excerpt,
// the instructions and the list of existing tags go in, a few tags and a
// sentence come out. Prices are compared with this many input tokens per
// output token.
export const INPUT_TOKENS_PER_OUTPUT_TOKEN = 10;

/**
 * One number to compare models by: the cost of a typical request, i.e.
 * INPUT_TOKENS_PER_OUTPUT_TOKEN input tokens and one output token.
 * @param {{input: number, output: number}} price
 * @returns {number}
 */
export function typicalCost(price) {
  return price.input * INPUT_TOKENS_PER_OUTPUT_TOKEN + price.output;
}

/**
 * The provider (see aiProviders.js) a model of the price list belongs to, by
 * the start of its id; null for models of no provider the extension offers.
 * @param {string} prefix
 * @returns {string | null}
 */
export function providerOfModel(prefix) {
  if (prefix.startsWith('claude')) return 'claude';
  // open-weights models served by Groq (before the "gpt-" test below)
  if (/^(llama|gpt-oss|qwen)/.test(prefix)) return 'groq';
  if (/^(gpt-|chatgpt-|o\d)/.test(prefix)) return 'openai';
  if (prefix.startsWith('gemini')) return 'gemini';
  if (/^(mistral|ministral|codestral)/.test(prefix)) return 'mistral';
  if (prefix.startsWith('deepseek')) return 'deepseek';
  return null;
}

/**
 * The cheapest models of the price list over all providers, cheapest first
 * (cost of a typical request, see typicalCost).
 * @param {number} [limit]
 * @returns {Array<{model: string, provider: string, price: {input: number, output: number}}>}
 */
export function cheapestModels(limit = 10) {
  return current
    .flatMap(([model, input, output]) => {
      const provider = providerOfModel(model);
      return provider ? [{ model, provider, price: { input, output } }] : [];
    })
    .sort((a, b) => typicalCost(a.price) - typicalCost(b.price))
    .slice(0, limit);
}
