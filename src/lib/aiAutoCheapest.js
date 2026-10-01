// @ts-check
// The logic behind "switch automatically to the cheapest model of a provider I
// have an API key for". Pure: the downloading of the model lists and the saving
// of the choice are in src/background/modules/ai/autoCheapest.js.
import { cheapestModels, getPrice, typicalCost } from './aiPricing.js';

// The new model must be at least this much cheaper than the current one;
// otherwise the AI would hop between nearly equal models.
const MIN_SAVING = 0.1;

/**
 * The model id a provider offers for a name of the price list. The list holds
 * the start of an id ("claude-3-5-haiku"), a provider the exact ids: an exact
 * match wins, else the first id that starts with the name (APIs list the newest
 * first).
 * @param {string[]} offered - The ids the provider offers.
 * @param {string} name
 * @returns {string | null} null if the provider offers nothing like it.
 */
export function findOffered(offered, name) {
  return (
    offered.find((id) => id === name) ??
    offered.find((id) => id.startsWith(name)) ??
    null
  );
}

/**
 * @typedef {object} Choice
 * @property {string} provider - Provider id.
 * @property {string} model - Exact model id the provider offers.
 */

/**
 * The cheapest model that the providers with a key offer, if it is clearly
 * cheaper than the model in use. Models are compared by the cost of a typical
 * request (typicalCost). Only models the provider really offers count -- the
 * price list also holds models an account may not have.
 * @param {{provider: string, model: string}} current - The provider and model in use.
 * @param {Record<string, string[]>} offered - Provider id -> the model ids it
 *   offers, for the providers that have a key (and could be asked).
 * @returns {Choice | null} null if the model in use has no known price (nothing
 *   to compare with) or nothing clearly cheaper is offered.
 */
export function chooseCheapest(current, offered) {
  const currentPrice = getPrice(current.provider, current.model);
  if (!currentPrice) return null;
  const limit = typicalCost(currentPrice) * (1 - MIN_SAVING);

  // cheapest first: the first one that fits is the cheapest there is
  for (const entry of cheapestModels(Number.POSITIVE_INFINITY)) {
    if (typicalCost(entry.price) >= limit) return null;
    const ids = offered[entry.provider];
    if (!ids) continue;
    const model = findOffered(ids, entry.model);
    if (!model) continue;
    // "claude-opus-4" also finds the dearer "claude-opus-4-5-...": the real id
    // has to be cheap enough itself
    const price = getPrice(entry.provider, model);
    if (!price || typicalCost(price) >= limit) continue;
    if (entry.provider === current.provider && model === current.model) {
      continue;
    }
    return { provider: entry.provider, model };
  }
  return null;
}
