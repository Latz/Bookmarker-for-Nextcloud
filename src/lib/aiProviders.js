// @ts-check
// Registry of the AI providers offered on the options page (AI tab).
// Every provider stores `input_<id>ApiKey`, `input_<id>Model` and
// `input_<id>BaseUrl`; `select_aiProvider` holds the chosen id (or 'off').

/**
 * @typedef {object} AiProvider
 * @property {string} id
 * @property {string} label
 * @property {'anthropic' | 'openai'} protocol - Wire format of the API.
 * @property {string} baseUrl - Default base URL.
 * @property {string} defaultModel
 * @property {boolean} needsKey
 * @property {boolean} [freeModel] - Model is typed in (list may be empty).
 * @property {boolean} [filterChatModels] - /models also lists non-chat models.
 */

/** @type {AiProvider[]} */
export const AI_PROVIDERS = [
  {
    id: 'claude',
    label: 'Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5-20251001',
    needsKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5-mini',
    needsKey: true,
    filterChatModels: true,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    needsKey: true,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    needsKey: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    needsKey: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5-mini',
    needsKey: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    needsKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    needsKey: false,
    freeModel: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    protocol: 'openai',
    baseUrl: '',
    defaultModel: '',
    needsKey: false,
    freeModel: true,
  },
];

/**
 * @param {unknown} id
 * @returns {AiProvider | undefined}
 */
export function getProvider(id) {
  return AI_PROVIDERS.find((provider) => provider.id === id);
}

/** Default values of all per-provider options, for storage.js. */
export function aiProviderDefaults() {
  /** @type {Record<string, string>} */
  const defaults = {};
  for (const p of AI_PROVIDERS) {
    defaults[`input_${p.id}ApiKey`] = '';
    defaults[`input_${p.id}Model`] = p.defaultModel;
    defaults[`input_${p.id}BaseUrl`] = p.baseUrl;
  }
  return defaults;
}
