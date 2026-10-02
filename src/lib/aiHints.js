// @ts-check
// Which models of each AI provider are the cheap ones -- in words, by model
// family ("the mini models"), not by model and not with prices: names and
// prices change, the order of the families hardly does. The texts are the
// i18n entries `aiHint_<id>`; each hint links to the provider's own price page.
// Written from the providers' price pages as of HINTS_AS_OF; check there.

/** When the hints were checked against the price pages (YYYY-MM). */
export const HINTS_AS_OF = '2026-10';

/**
 * @typedef {object} Hint
 * @property {string} id - Provider id (aiProviders.js); its text is aiHint_<id>.
 * @property {string} [pricingUrl] - The provider's own price page.
 */

/** @type {Hint[]} */
export const HINTS = [
  {
    id: 'claude',
    pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
  },
  {
    id: 'openai',
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
  },
  {
    id: 'gemini',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  {
    id: 'mistral',
    pricingUrl: 'https://docs.mistral.ai/inference/pricing',
  },
  {
    id: 'groq',
    pricingUrl: 'https://console.groq.com/docs/models',
  },
  {
    id: 'deepseek',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  },
  {
    id: 'openrouter',
    pricingUrl: 'https://openrouter.ai/models',
  },
  // runs on the user's computer: nothing to look up
  { id: 'ollama' },
];
