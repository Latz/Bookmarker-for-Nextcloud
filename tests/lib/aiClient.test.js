// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/storage.js', () => ({ getOptions: vi.fn() }));

import { getOptions } from '../../src/lib/storage.js';
import { askAI, listModels, testProvider } from '../../src/lib/aiClient.js';

const base = {
  input_claudeApiKey: 'ck',
  input_claudeModel: 'claude-m',
  input_claudeBaseUrl: 'https://api.anthropic.com/',
  input_openaiApiKey: 'ok',
  input_openaiModel: 'gpt-m',
  input_openaiBaseUrl: 'https://api.openai.com/v1',
  input_geminiApiKey: 'gk',
  input_geminiModel: 'gemini-m',
  input_geminiBaseUrl:
    'https://generativelanguage.googleapis.com/v1beta/openai',
  input_ollamaApiKey: '',
  input_ollamaModel: 'llama3',
  input_ollamaBaseUrl: 'http://localhost:11434/v1/',
  input_networkTimeout: 10,
};

describe('aiClient', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  it('rejects when no provider is selected', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'off' });
    await expect(askAI('hi')).rejects.toThrow('No AI provider');
  });

  it('rejects when the api key is missing', async () => {
    getOptions.mockResolvedValue({
      ...base,
      select_aiProvider: 'claude',
      input_claudeApiKey: '',
    });
    await expect(askAI('hi')).rejects.toThrow('No API key');
  });

  it('calls the Claude messages API', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'claude' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'answer' }] }),
    });
    await expect(askAI('hi')).resolves.toBe('answer');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('ck');
    expect(JSON.parse(init.body).model).toBe('claude-m');
  });

  it('calls the OpenAI chat completions API', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'openai' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'answer' } }] }),
    });
    await expect(askAI('hi')).resolves.toBe('answer');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer ok');
  });

  it('calls OpenAI-compatible providers at their own base URL', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'gemini' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'answer' } }] }),
    });
    await expect(askAI('hi')).resolves.toBe('answer');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(init.headers.Authorization).toBe('Bearer gk');
    expect(JSON.parse(init.body).model).toBe('gemini-m');
  });

  it('works without a key for Ollama and sends no Authorization header', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'ollama' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] }),
    });
    await expect(askAI('hi')).resolves.toBe('hi');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('rejects an unknown provider id and a missing model', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'nope' });
    await expect(askAI('hi')).rejects.toThrow('No AI provider');
    getOptions.mockResolvedValue({
      ...base,
      select_aiProvider: 'ollama',
      input_ollamaModel: '',
    });
    await expect(askAI('hi')).rejects.toThrow('No model');
  });

  it('throws on an HTTP error', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'openai' });
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(askAI('hi')).rejects.toThrow('401');
  });

  it('throws on an answer without text', async () => {
    getOptions.mockResolvedValue({ ...base, select_aiProvider: 'claude' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(askAI('hi')).rejects.toThrow('empty answer');
  });

  describe('listModels', () => {
    it('lists Claude models with their display names', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-a', display_name: 'Claude A' },
            { id: 'claude-b' },
          ],
        }),
      });
      const models = await listModels(
        'claude',
        'ck',
        'https://api.anthropic.com/',
      );
      expect(models).toEqual([
        { id: 'claude-a', label: 'Claude A' },
        { id: 'claude-b', label: 'claude-b' },
      ]);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000');
      expect(init.headers['x-api-key']).toBe('ck');
    });

    it('keeps only chat models from the official OpenAI API, sorted', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'text-embedding-3-small' },
            { id: 'gpt-4o-mini' },
            { id: 'whisper-1' },
            { id: 'gpt-4o-audio-preview' },
            { id: 'o3-mini' },
            { id: 'gpt-4.1' },
          ],
        }),
      });
      const models = await listModels(
        'openai',
        'ok',
        'https://api.openai.com/v1',
      );
      expect(models.map((m) => m.id)).toEqual([
        'gpt-4.1',
        'gpt-4o-mini',
        'o3-mini',
      ]);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.openai.com/v1/models',
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        'Bearer ok',
      );
    });

    it('does not filter models of a custom OpenAI-compatible server', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'llama3' }, { id: 'mistral' }] }),
      });
      const models = await listModels(
        'openai',
        'ok',
        'https://ollama.example/v1',
      );
      expect(models.map((m) => m.id)).toEqual(['llama3', 'mistral']);
    });

    it('strips the "models/" prefix of Gemini model ids', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'models/gemini-2.5-flash' }] }),
      });
      const models = await listModels('gemini', 'gk', 'https://g.example/v1');
      expect(models).toEqual([
        { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      ]);
    });

    it('lists local models without a key', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'llama3' }] }),
      });
      await listModels('ollama', '', 'http://localhost:11434/v1');
      expect(fetchMock.mock.calls[0][1].headers).toEqual({});
    });

    it('rejects without a key and on HTTP errors', async () => {
      await expect(listModels('claude', '', 'https://x')).rejects.toThrow(
        'No API key',
      );
      fetchMock.mockResolvedValue({ ok: false, status: 401 });
      await expect(listModels('claude', 'k', 'https://x')).rejects.toThrow(
        '401',
      );
    });
  });

  describe('testProvider', () => {
    const settings = {
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://api.openai.com/v1',
    };

    it('resolves when the provider answers', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
      });
      await expect(testProvider('openai', settings)).resolves.toBeUndefined();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init.headers.Authorization).toBe('Bearer k');
    });

    it('rejects with the HTTP status', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });
      await expect(testProvider('openai', settings)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('rejects without a key, without a model and for unknown providers', async () => {
      await expect(
        testProvider('openai', { ...settings, apiKey: '' }),
      ).rejects.toThrow('No API key');
      await expect(
        testProvider('openai', { ...settings, model: '' }),
      ).rejects.toThrow('No model');
      await expect(testProvider('nope', settings)).rejects.toThrow(
        'No AI provider',
      );
    });
  });
});
