// @ts-check
// Is there a cheaper model than the selected one? Models are compared by the
// cost of a typical request (typicalCost in aiPricing.js), using the prices
// that are known; a model without a known price cannot be judged and is left
// out. Pure logic, no browser APIs -- the weekly job that uses it is in
// src/background/modules/ai/modelCheck.js.
import { getPrice, typicalCost } from './aiPricing.js';

// A model must be at least this much cheaper to be worth a message; a few
// percent less is no reason to bother the user.
const MIN_SAVING = 0.1;

/**
 * @typedef {object} CheaperModel
 * @property {string} id
 * @property {string} label
 * @property {{input: number, output: number}} price - Dollars per million tokens.
 * @property {{input: number, output: number}} selectedPrice
 */

/**
 * The cheapest model of the list that costs clearly less than the selected
 * one.
 * @param {string} providerId
 * @param {string} selectedModel - The model in use.
 * @param {Array<{id: string, label?: string}>} models - What the provider offers.
 * @returns {CheaperModel | null} null if the selected model has no known price
 *   (nothing to compare with) or none of the offered models is cheaper.
 */
export function findCheaperModel(providerId, selectedModel, models) {
  const selectedPrice = getPrice(providerId, selectedModel);
  if (!selectedPrice) return null;
  const limit = typicalCost(selectedPrice) * (1 - MIN_SAVING);

  /** @type {CheaperModel | null} */
  let best = null;
  for (const model of models) {
    if (model.id === selectedModel) continue;
    const price = getPrice(providerId, model.id);
    if (!price || typicalCost(price) >= limit) continue;
    if (!best || typicalCost(price) < typicalCost(best.price)) {
      best = {
        id: model.id,
        label: model.label ?? model.id,
        price,
        selectedPrice,
      };
    }
  }
  return best;
}
