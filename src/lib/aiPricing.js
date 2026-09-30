// @ts-check
// Rough prices (US dollars per million tokens) of well-known models, to
// estimate what the AI calls cost. These are list prices from the providers'
// price pages and can be out of date; the options page calls the result an
// estimate. Models that are not listed show their tokens but no cost.
// A model matches the longest prefix of its id (so dated ids like
// "claude-haiku-4-5-20251001" find "claude-haiku-4-5").

/** @type {Array<[prefix: string, input: number, output: number]>} */
const PRICES = [
  // Anthropic
  ['claude-opus-4-5', 5, 25],
  ['claude-opus-4-1', 15, 75],
  ['claude-opus-4', 15, 75],
  ['claude-sonnet-4', 3, 15],
  ['claude-haiku-4-5', 1, 5],
  ['claude-3-5-haiku', 0.8, 4],
  // OpenAI
  ['gpt-5-nano', 0.05, 0.4],
  ['gpt-5-mini', 0.25, 2],
  ['gpt-5', 1.25, 10],
  ['gpt-4.1-nano', 0.1, 0.4],
  ['gpt-4.1-mini', 0.4, 1.6],
  ['gpt-4.1', 2, 8],
  ['gpt-4o-mini', 0.15, 0.6],
  ['gpt-4o', 2.5, 10],
  ['o3-mini', 1.1, 4.4],
  // Google
  ['gemini-2.5-flash-lite', 0.1, 0.4],
  ['gemini-2.5-flash', 0.3, 2.5],
  ['gemini-2.5-pro', 1.25, 10],
  // Others
  ['mistral-small', 0.1, 0.3],
  ['mistral-large', 2, 6],
  ['deepseek-chat', 0.28, 0.42],
  ['llama-3.3-70b', 0.59, 0.79],
];

// Longest prefix first, so "gpt-5-mini" wins over "gpt-5".
const SORTED = [...PRICES].sort((a, b) => b[0].length - a[0].length);

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
