// @ts-check
// "Switch automatically to the cheapest model of a provider I have an API key
// for": looks at the model lists of all providers with a key, picks the
// cheapest model that is clearly cheaper than the one in use (see
// src/lib/aiAutoCheapest.js) and makes it the model in use. Runs once a week
// (modelCheck.js) and when the user switches the option on (options page).
import { listModels } from '../../../lib/aiClient.js';
import { chooseCheapest } from '../../../lib/aiAutoCheapest.js';
import { AI_PROVIDERS, getProvider } from '../../../lib/aiProviders.js';
import { getPrice } from '../../../lib/aiPricing.js';
import { getOptions, store_data } from '../../../lib/storage.js';

/**
 * Host permission pattern of an AI server (https, or http for a local one).
 * @param {string} baseUrl
 * @returns {string | null}
 */
export function hostPattern(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    const allowed =
      url.protocol === 'https:' || (local && url.protocol === 'http:');
    return allowed ? `${url.protocol}//${url.hostname}/*` : null;
  } catch {
    return null;
  }
}

/**
 * The providers that have an API key entered, with what is needed to ask them.
 * @returns {Promise<Array<{id: string, label: string, apiKey: string, baseUrl: string}>>}
 */
export async function providersWithKey() {
  const names = AI_PROVIDERS.filter((p) => p.needsKey).flatMap((p) => [
    `input_${p.id}ApiKey`,
    `input_${p.id}BaseUrl`,
  ]);
  const options = await getOptions(names);
  return AI_PROVIDERS.filter((p) => p.needsKey)
    .map((p) => ({
      id: p.id,
      label: p.label,
      apiKey: String(options[`input_${p.id}ApiKey`] ?? '').trim(),
      baseUrl: String(options[`input_${p.id}BaseUrl`] ?? '').trim(),
    }))
    .filter((p) => p.apiKey);
}

/**
 * @typedef {object} Switched
 * @property {string} provider - Provider id.
 * @property {string} providerLabel
 * @property {string} model - The new model.
 * @property {string} from - The model that was in use.
 * @property {{input: number, output: number} | null} price - Of the new model.
 */

/**
 * Switches to the cheapest model of the providers with a key, if that is
 * clearly cheaper than the model in use. Does nothing if no provider is chosen
 * ("off"), so the AI is never switched on by this. Providers whose server is
 * not permitted (no host permission yet) or whose list cannot be loaded are
 * left out. Never throws.
 * @returns {Promise<Switched | null>} What was switched to, or null.
 */
export async function applyAutoCheapest() {
  try {
    const options = await getOptions([
      'select_aiProvider',
      'input_networkTimeout',
    ]);
    const currentProvider = getProvider(options.select_aiProvider);
    if (!currentProvider) return null;
    const modelKey = `input_${currentProvider.id}Model`;
    const { [modelKey]: currentModel } = await getOptions([modelKey]);
    if (!currentModel) return null;

    const keyed = await providersWithKey();
    const lists = await Promise.all(
      keyed.map(async (provider) => {
        const pattern = hostPattern(provider.baseUrl);
        if (
          !pattern ||
          !(await chrome.permissions.contains({ origins: [pattern] }))
        ) {
          return null;
        }
        try {
          const models = await listModels(
            provider.id,
            provider.apiKey,
            provider.baseUrl,
            options.input_networkTimeout,
          );
          return [provider.id, models.map((m) => m.id)];
        } catch {
          return null; // key refused, server down: this provider is out
        }
      }),
    );
    const offered = Object.fromEntries(lists.filter(Boolean));

    const choice = chooseCheapest(
      { provider: currentProvider.id, model: currentModel },
      offered,
    );
    if (!choice) return null;

    await store_data('options', {
      select_aiProvider: choice.provider,
      [`input_${choice.provider}Model`]: choice.model,
    });
    return {
      provider: choice.provider,
      providerLabel: getProvider(choice.provider)?.label ?? choice.provider,
      model: choice.model,
      from: currentModel,
      price: getPrice(choice.provider, choice.model),
    };
  } catch (error) {
    console.warn('[ai] automatic switch failed:', error?.message ?? error);
    return null;
  }
}
