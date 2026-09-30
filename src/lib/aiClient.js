// @ts-check
// Minimal client for the AI providers configured on the options page (AI tab).
// Supports the Anthropic Messages API and OpenAI-style chat completions (used
// by OpenAI, Gemini, Mistral, Groq, OpenRouter, DeepSeek, Ollama, custom).
import { getOptions } from './storage.js';
import { getProvider } from './aiProviders.js';
import { extractUsage, recordUsage } from './aiUsage.js';
import { timeoutMilliseconds } from './networkTimeout.js';

const MAX_TOKENS = 1024;

/**
 * URL and authentication headers of a provider endpoint.
 * @param {'anthropic' | 'openai'} protocol
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {string} path - Endpoint path, e.g. '/models'.
 * @returns {{url: string, headers: Record<string, string>}}
 */
function providerRequest(protocol, apiKey, baseUrl, path) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}${path}`;
  if (protocol === 'openai') {
    return {
      url,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    };
  }
  return {
    url,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  };
}

// OpenAI's /models also lists embedding, audio, image and moderation models;
// keep the chat-capable ones. Not applied to other servers behind a custom
// base URL (Ollama etc.), whose model names follow no pattern.
const OPENAI_CHAT_MODEL = /^(gpt-|chatgpt-|o\d)/;
const OPENAI_NON_CHAT =
  /(audio|realtime|transcribe|tts|image|search|instruct|embedding|moderation)/;

/**
 * @param {string} providerId
 * @returns {import('./aiProviders.js').AiProvider}
 */
function requireProvider(providerId) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error('No AI provider selected');
  return provider;
}

/**
 * Lists the models an AI provider offers.
 * @param {string} providerId - Id from aiProviders.js.
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {unknown} [timeoutSeconds] - Network timeout setting.
 * @returns {Promise<Array<{id: string, label: string}>>}
 * @throws {Error} If a required key is missing or the request fails.
 */
export async function listModels(providerId, apiKey, baseUrl, timeoutSeconds) {
  const provider = requireProvider(providerId);
  if (provider.needsKey && !apiKey) {
    throw new Error(`No API key set for ${provider.id}`);
  }
  const anthropic = provider.protocol === 'anthropic';
  const { url, headers } = providerRequest(
    provider.protocol,
    apiKey,
    baseUrl,
    anthropic ? '/v1/models?limit=1000' : '/models',
  );
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMilliseconds(timeoutSeconds)),
  });
  if (!response.ok) {
    throw new Error(`${provider.id} request failed: ${response.status}`);
  }
  const data = await response.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  if (anthropic) {
    // The API already returns the newest model first.
    return list.map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
  }
  const official =
    provider.filterChatModels && String(baseUrl) === provider.baseUrl;
  return list
    .map((m) => String(m.id).replace(/^models\//, ''))
    .filter(
      (id) =>
        !official || (OPENAI_CHAT_MODEL.test(id) && !OPENAI_NON_CHAT.test(id)),
    )
    .sort()
    .map((id) => ({ id, label: id }));
}

/**
 * @typedef {object} ProviderSettings
 * @property {string} apiKey
 * @property {string} model
 * @property {string} baseUrl
 * @property {unknown} [timeoutSeconds] - Network timeout setting.
 */

/**
 * Sends one prompt to a provider with the given settings.
 * @param {import('./aiProviders.js').AiProvider} provider
 * @param {ProviderSettings} settings
 * @param {string} prompt
 * @returns {Promise<string>} The text of the answer.
 * @throws {Error} With the HTTP status in `status` if the API rejects it.
 */
async function sendPrompt(provider, settings, prompt) {
  const { apiKey, model, baseUrl, timeoutSeconds } = settings;
  if (provider.needsKey && !apiKey) {
    throw new Error(`No API key set for ${provider.id}`);
  }
  if (!model) throw new Error(`No model set for ${provider.id}`);
  const anthropic = provider.protocol === 'anthropic';

  const { url, headers } = providerRequest(
    provider.protocol,
    apiKey,
    baseUrl,
    anthropic ? '/v1/messages' : '/chat/completions',
  );
  const messages = [{ role: 'user', content: prompt }];
  const body = anthropic
    ? { model, max_tokens: MAX_TOKENS, messages }
    : { model, messages };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMilliseconds(timeoutSeconds)),
  });
  if (!response.ok) {
    throw Object.assign(
      new Error(`${provider.id} request failed: ${response.status}`),
      { status: response.status },
    );
  }
  const data = await response.json();
  // The request is paid for whether or not the answer is usable
  void recordUsage(provider.id, model, extractUsage(data));
  const text = anthropic
    ? data.content?.find((part) => part.type === 'text')?.text
    : data.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error(`${provider.id}: empty answer`);
  return text;
}

/**
 * Sends a prompt to the configured AI provider.
 * @param {string} prompt
 * @returns {Promise<string>} The text of the answer.
 * @throws {Error} If no provider/key is configured or the request fails.
 */
export async function askAI(prompt) {
  const { select_aiProvider: id } = await getOptions(['select_aiProvider']);
  const provider = requireProvider(id);
  const key = (field) => `input_${provider.id}${field}`;
  const options = await getOptions([
    key('ApiKey'),
    key('Model'),
    key('BaseUrl'),
    'input_networkTimeout',
  ]);
  return sendPrompt(
    provider,
    {
      apiKey: options[key('ApiKey')],
      model: options[key('Model')],
      baseUrl: options[key('BaseUrl')],
      timeoutSeconds: options.input_networkTimeout,
    },
    prompt,
  );
}

/**
 * Checks key, model and server of a provider with a tiny request, using the
 * values typed into the options page (not necessarily saved or selected).
 * @param {string} providerId
 * @param {ProviderSettings} settings
 * @returns {Promise<void>}
 * @throws {Error} With the HTTP status in `status` if the API rejects it.
 */
export async function testProvider(providerId, settings) {
  await sendPrompt(requireProvider(providerId), settings, 'Reply with: OK');
}
