// @ts-check
// Minimal client for the AI providers configured on the options page (AI tab).
// Supports Claude (Anthropic Messages API) and OpenAI (chat completions).
import { getOptions } from './storage.js';
import { timeoutMilliseconds } from './networkTimeout.js';

const MAX_TOKENS = 1024;

/**
 * URL and authentication headers of a provider endpoint.
 * @param {'claude' | 'openai'} provider
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {string} path - Endpoint path, e.g. '/models'.
 * @returns {{url: string, headers: Record<string, string>}}
 */
function providerRequest(provider, apiKey, baseUrl, path) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}${path}`;
  return provider === 'claude'
    ? {
        url,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }
    : { url, headers: { Authorization: `Bearer ${apiKey}` } };
}

// OpenAI's /models also lists embedding, audio, image and moderation models;
// keep the chat-capable ones. Not applied to other servers behind a custom
// base URL (Ollama etc.), whose model names follow no pattern.
const OPENAI_CHAT_MODEL = /^(gpt-|chatgpt-|o\d)/;
const OPENAI_NON_CHAT =
  /(audio|realtime|transcribe|tts|image|search|instruct|embedding|moderation)/;

/**
 * Lists the models an AI provider offers.
 * @param {'claude' | 'openai'} provider
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {unknown} [timeoutSeconds] - Network timeout setting.
 * @returns {Promise<Array<{id: string, label: string}>>}
 * @throws {Error} If the key is missing or the request fails.
 */
export async function listModels(provider, apiKey, baseUrl, timeoutSeconds) {
  if (!apiKey) throw new Error(`No API key set for ${provider}`);
  const { url, headers } = providerRequest(
    provider,
    apiKey,
    baseUrl,
    provider === 'claude' ? '/v1/models?limit=1000' : '/models',
  );
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMilliseconds(timeoutSeconds)),
  });
  if (!response.ok) {
    throw new Error(`${provider} request failed: ${response.status}`);
  }
  const data = await response.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  if (provider === 'claude') {
    // The API already returns the newest model first.
    return list.map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
  }
  const official = String(baseUrl).startsWith('https://api.openai.com');
  return list
    .map((m) => m.id)
    .filter(
      (id) =>
        !official || (OPENAI_CHAT_MODEL.test(id) && !OPENAI_NON_CHAT.test(id)),
    )
    .sort()
    .map((id) => ({ id, label: id }));
}

/**
 * Sends a prompt to the configured AI provider.
 * @param {string} prompt
 * @returns {Promise<string>} The text of the answer.
 * @throws {Error} If no provider/key is configured or the request fails.
 */
export async function askAI(prompt) {
  const options = await getOptions([
    'select_aiProvider',
    'input_claudeApiKey',
    'input_claudeModel',
    'input_claudeBaseUrl',
    'input_openaiApiKey',
    'input_openaiModel',
    'input_openaiBaseUrl',
    'input_networkTimeout',
  ]);
  const provider = options.select_aiProvider;
  if (provider !== 'claude' && provider !== 'openai') {
    throw new Error('No AI provider selected');
  }
  const apiKey = options[`input_${provider}ApiKey`];
  if (!apiKey) throw new Error(`No API key set for ${provider}`);
  const baseUrl = String(options[`input_${provider}BaseUrl`]).replace(
    /\/+$/,
    '',
  );
  const model = options[`input_${provider}Model`];

  const { url, headers } = providerRequest(
    provider,
    apiKey,
    baseUrl,
    provider === 'claude' ? '/v1/messages' : '/chat/completions',
  );
  const body =
    provider === 'claude'
      ? {
          model,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        }
      : { model, messages: [{ role: 'user', content: prompt }] };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(
      timeoutMilliseconds(options.input_networkTimeout),
    ),
  });
  if (!response.ok) {
    throw new Error(`${provider} request failed: ${response.status}`);
  }
  const data = await response.json();
  const text =
    provider === 'claude'
      ? data.content?.find((part) => part.type === 'text')?.text
      : data.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error(`${provider}: empty answer`);
  return text;
}
