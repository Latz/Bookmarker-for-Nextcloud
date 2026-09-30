// @ts-check
// Counts what the AI calls use: requests and input/output tokens per provider
// and model, as reported by the API. Kept in chrome.storage.local and shown in
// the options (AI tab), together with an estimated cost (see aiPricing.js).

const STORAGE_KEY = 'aiUsage';

/**
 * @typedef {object} ModelUsage
 * @property {string} provider - Provider id (aiProviders.js).
 * @property {string} model
 * @property {number} requests
 * @property {number} inputTokens
 * @property {number} outputTokens
 */

/**
 * @typedef {object} UsageStats
 * @property {number} since - When counting started (ms), 0 if it has not.
 * @property {Record<string, ModelUsage>} models - By "provider|model".
 */

// Updates are read-modify-write; run them one after the other so that two
// calls finishing together cannot overwrite each other's count.
let queue = Promise.resolve();

/**
 * Token counts from an API answer. OpenAI-style answers report
 * prompt_tokens/completion_tokens, Anthropic input_tokens/output_tokens.
 * @param {any} data - The parsed JSON answer.
 * @returns {{inputTokens: number, outputTokens: number}} 0 if not reported.
 */
export function extractUsage(data) {
  const usage = data?.usage ?? {};
  const count = (value) =>
    Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  return {
    inputTokens: count(usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: count(usage.output_tokens ?? usage.completion_tokens),
  };
}

/**
 * Adds one request to the statistics. Never throws or rejects: counting must
 * not break an AI call.
 * @param {string} provider
 * @param {string} model
 * @param {{inputTokens: number, outputTokens: number}} tokens
 * @returns {Promise<void>}
 */
export function recordUsage(provider, model, tokens) {
  queue = queue.then(async () => {
    try {
      const stats = await getUsage();
      const key = `${provider}|${model}`;
      const entry = stats.models[key] ?? {
        provider,
        model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      entry.requests += 1;
      entry.inputTokens += tokens.inputTokens;
      entry.outputTokens += tokens.outputTokens;
      stats.models[key] = entry;
      stats.since ||= Date.now();
      await chrome.storage.local.set({ [STORAGE_KEY]: stats });
    } catch {
      // no storage API (tests, unsupported context): nothing to count
    }
  });
  return queue;
}

/**
 * @returns {Promise<UsageStats>} The statistics (empty if there are none).
 */
export async function getUsage() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const stats = stored?.[STORAGE_KEY];
    if (stats && typeof stats.models === 'object') return stats;
  } catch {
    // fall through to the empty statistics
  }
  return { since: 0, models: {} };
}

/**
 * Starts counting from zero -- for one provider, or for all if none is given.
 * Never throws.
 * @param {string} [provider] - Provider id.
 * @returns {Promise<void>}
 */
export async function resetUsage(provider) {
  try {
    if (provider) {
      const stats = await getUsage();
      for (const [key, entry] of Object.entries(stats.models)) {
        if (entry.provider === provider) delete stats.models[key];
      }
      if (Object.keys(stats.models).length > 0) {
        await chrome.storage.local.set({ [STORAGE_KEY]: stats });
        return;
      }
    }
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // nothing to reset
  }
}

/** Name of the storage entry, for chrome.storage.onChanged listeners. */
export const USAGE_STORAGE_KEY = STORAGE_KEY;
