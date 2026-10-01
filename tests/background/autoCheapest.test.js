// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/storage.js', () => ({
  getOptions: vi.fn(),
  store_data: vi.fn(),
}));
vi.mock('../../src/lib/aiClient.js', () => ({ listModels: vi.fn() }));

import { getOptions, store_data } from '../../src/lib/storage.js';
import { listModels } from '../../src/lib/aiClient.js';
import {
  applyAutoCheapest,
  hostPattern,
  providersWithKey,
} from '../../src/background/modules/ai/autoCheapest.js';

describe('autoCheapest', () => {
  let options;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    options = {
      select_aiProvider: 'claude',
      input_networkTimeout: 10,
      input_claudeModel: 'claude-opus-5-5-20260922',
      input_claudeApiKey: 'ck',
      input_claudeBaseUrl: 'https://api.anthropic.com',
      input_openaiApiKey: 'ok',
      input_openaiBaseUrl: 'https://api.openai.com/v1',
      input_geminiApiKey: '',
      input_geminiBaseUrl:
        'https://generativelanguage.googleapis.com/v1beta/openai',
    };
    getOptions.mockImplementation(async (keys) =>
      Object.fromEntries(keys.map((key) => [key, options[key]])),
    );
    listModels.mockImplementation(async (id) =>
      id === 'openai'
        ? [{ id: 'gpt-5' }, { id: 'gpt-5-nano' }]
        : [
            { id: 'claude-opus-5-5-20260922' },
            { id: 'claude-haiku-4-5-20251001' },
          ],
    );
    globalThis.chrome = {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
    };
  });

  describe('hostPattern', () => {
    it('allows https, and http only for a local server', () => {
      expect(hostPattern('https://api.openai.com/v1')).toBe(
        'https://api.openai.com/*',
      );
      expect(hostPattern('http://localhost:11434/v1')).toBe(
        'http://localhost/*',
      );
      expect(hostPattern('http://example.com')).toBeNull();
      expect(hostPattern('nonsense')).toBeNull();
    });
  });

  describe('providersWithKey', () => {
    it('lists the providers that need and have a key', async () => {
      const list = await providersWithKey();
      expect(list.map((p) => p.id)).toEqual(['claude', 'openai']);
      expect(list[0]).toMatchObject({ apiKey: 'ck', label: 'Claude' });
    });
  });

  describe('applyAutoCheapest', () => {
    it('switches to the cheapest model of any provider with a key and saves it', async () => {
      const result = await applyAutoCheapest();

      expect(result).toMatchObject({
        provider: 'openai',
        providerLabel: 'OpenAI',
        model: 'gpt-5-nano',
        from: 'claude-opus-5-5-20260922',
        price: { input: 0.05, output: 0.4 },
      });
      expect(store_data).toHaveBeenCalledWith('options', {
        select_aiProvider: 'openai',
        input_openaiModel: 'gpt-5-nano',
      });
    });

    it('asks only the providers with a key', async () => {
      await applyAutoCheapest();
      expect(listModels.mock.calls.map((call) => call[0]).sort()).toEqual([
        'claude',
        'openai',
      ]);
    });

    it('leaves out a provider whose server is not permitted or whose list fails', async () => {
      chrome.permissions.contains.mockImplementation(async ({ origins }) =>
        origins[0].includes('openai.com') ? false : true,
      );
      const result = await applyAutoCheapest();
      expect(result).toMatchObject({
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
      });

      chrome.permissions.contains.mockResolvedValue(true);
      listModels.mockImplementation(async (id) => {
        if (id === 'openai') throw new Error('401');
        return [{ id: 'claude-opus-5-5-20260922' }];
      });
      expect(await applyAutoCheapest()).toBeNull();
    });

    it('does nothing when the AI is off, so it never switches the AI on', async () => {
      options.select_aiProvider = 'off';
      expect(await applyAutoCheapest()).toBeNull();
      expect(listModels).not.toHaveBeenCalled();
      expect(store_data).not.toHaveBeenCalled();
    });

    it('does nothing when the model in use is the cheapest or has no known price', async () => {
      options.input_claudeModel = 'claude-haiku-4-5-20251001';
      listModels.mockImplementation(async () => [
        { id: 'claude-haiku-4-5-20251001' },
      ]);
      options.input_openaiApiKey = '';
      expect(await applyAutoCheapest()).toBeNull();

      options.input_claudeModel = 'my-own-model';
      expect(await applyAutoCheapest()).toBeNull();
      expect(store_data).not.toHaveBeenCalled();
    });

    it('never throws', async () => {
      getOptions.mockRejectedValue(new Error('db'));
      expect(await applyAutoCheapest()).toBeNull();
    });
  });
});
