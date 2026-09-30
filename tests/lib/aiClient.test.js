// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/storage.js', () => ({ getOptions: vi.fn() }));

import { getOptions } from '../../src/lib/storage.js';
import { askAI, listModels } from '../../src/lib/aiClient.js';

const base = {
  input_claudeApiKey: 'ck',
  input_claudeModel: 'claude-m',
  input_claudeBaseUrl: 'https://api.anthropic.com/',
  input_openaiApiKey: 'ok',
  input_openaiModel: 'gpt-m',
  input_openaiBaseUrl: 'https://api.openai.com/v1',
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
});
