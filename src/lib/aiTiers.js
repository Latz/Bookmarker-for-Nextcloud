// @ts-check
// Which models of a provider are the cheap ones, by the family in their name --
// the statements behind the hints box (aiHints.js) and the colours of the model
// dropdowns: tier 1 (green) the cheapest family, tier 2 (yellow) the next
// cheapest, tier 0 the more expensive ones. There are no prices in the
// extension; a model of a family not listed (a new name) is not coloured.

/**
 * @typedef {object} Family
 * @property {string} [name] - Shown as it is ("Haiku").
 * @property {string} [nameKey] - i18n key of the name, if it needs translating.
 * @property {0 | 1 | 2} tier
 * @property {RegExp | null} pattern - Matches model ids; null: every other model.
 */

/**
 * Per provider the families, cheapest first. The first family that matches a
 * model id is its family ("flash-lite" must come before "flash").
 * @type {Record<string, Family[]>}
 */
export const FAMILIES = {
  claude: [
    { name: 'Haiku', tier: 1, pattern: /haiku/i },
    { name: 'Sonnet', tier: 2, pattern: /sonnet/i },
    { name: 'Opus', tier: 0, pattern: /opus/i },
  ],
  openai: [
    { name: 'nano', tier: 1, pattern: /nano/i },
    { name: 'mini', tier: 2, pattern: /mini/i },
    { nameKey: 'aiFamilyFull', tier: 0, pattern: null },
  ],
  gemini: [
    { name: 'Flash-Lite', tier: 1, pattern: /flash-lite/i },
    { name: 'Flash', tier: 2, pattern: /flash/i },
    { name: 'Pro', tier: 0, pattern: /pro/i },
  ],
  mistral: [
    { name: 'Ministral, Small', tier: 1, pattern: /ministral|small/i },
    { name: 'Large', tier: 2, pattern: /large/i },
    { name: 'Medium', tier: 0, pattern: /medium/i },
  ],
  groq: [
    { name: 'gpt-oss-20b', tier: 1, pattern: /gpt-oss-20b/i },
    { name: 'gpt-oss', tier: 2, pattern: /gpt-oss/i },
    { nameKey: 'aiFamilyOther', tier: 0, pattern: null },
  ],
  deepseek: [
    { name: 'Flash', tier: 1, pattern: /flash/i },
    { name: 'Pro', tier: 2, pattern: /pro/i },
  ],
  openrouter: [
    { name: ':free', tier: 1, pattern: /:free$/i },
    { nameKey: 'aiFamilyOther', tier: 0, pattern: null },
  ],
};

/**
 * The family a model belongs to.
 * @param {string} providerId
 * @param {string} model - Model id as the provider's API names it.
 * @returns {Family | null} null for an unknown provider or a model of no
 *   listed family.
 */
export function familyOf(providerId, model) {
  const families = FAMILIES[providerId] ?? [];
  return (
    families.find(
      (family) => family.pattern === null || family.pattern.test(String(model)),
    ) ?? null
  );
}

/**
 * @param {string} providerId
 * @param {string} model - Model id as the provider's API names it.
 * @returns {0 | 1 | 2} 1: the cheapest family, 2: the next cheapest, 0: other
 *   or unknown.
 */
export function modelTier(providerId, model) {
  return familyOf(providerId, model)?.tier ?? 0;
}

/**
 * Sorts model ids into the families of a provider.
 * @param {string} providerId
 * @param {string[]} models - The ids the provider offers.
 * @returns {Array<{family: Family, models: string[]}>} Every family of the
 *   provider, cheapest first, with its models (maybe none).
 */
export function groupByFamily(providerId, models) {
  const groups = (FAMILIES[providerId] ?? []).map((family) => ({
    family,
    models: /** @type {string[]} */ ([]),
  }));
  for (const model of models) {
    const family = familyOf(providerId, model);
    groups.find((group) => group.family === family)?.models.push(model);
  }
  return groups;
}
