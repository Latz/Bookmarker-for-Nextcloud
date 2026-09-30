// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractUsage,
  getUsage,
  recordUsage,
  resetUsage,
} from '../../src/lib/aiUsage.js';

describe('aiUsage', () => {
  let store;

  beforeEach(() => {
    store = {};
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: store[key] })),
          set: vi.fn(async (values) => Object.assign(store, values)),
          remove: vi.fn(async (key) => {
            delete store[key];
          }),
        },
      },
    };
  });

  describe('extractUsage', () => {
    it('reads OpenAI and Anthropic token names', () => {
      expect(
        extractUsage({ usage: { prompt_tokens: 12, completion_tokens: 3 } }),
      ).toEqual({ inputTokens: 12, outputTokens: 3 });
      expect(
        extractUsage({ usage: { input_tokens: 7, output_tokens: 2 } }),
      ).toEqual({ inputTokens: 7, outputTokens: 2 });
    });

    it('gives 0 when the answer reports no usage', () => {
      expect(extractUsage({})).toEqual({ inputTokens: 0, outputTokens: 0 });
      expect(extractUsage(null)).toEqual({ inputTokens: 0, outputTokens: 0 });
      expect(extractUsage({ usage: { prompt_tokens: 'x' } })).toEqual({
        inputTokens: 0,
        outputTokens: 0,
      });
    });
  });

  describe('recordUsage', () => {
    it('adds up requests and tokens per provider and model', async () => {
      await recordUsage('openai', 'gpt-5-mini', {
        inputTokens: 100,
        outputTokens: 10,
      });
      await recordUsage('openai', 'gpt-5-mini', {
        inputTokens: 50,
        outputTokens: 5,
      });
      await recordUsage('claude', 'claude-haiku-4-5', {
        inputTokens: 1,
        outputTokens: 2,
      });

      const stats = await getUsage();

      expect(stats.since).toBeGreaterThan(0);
      expect(stats.models['openai|gpt-5-mini']).toEqual({
        provider: 'openai',
        model: 'gpt-5-mini',
        requests: 2,
        inputTokens: 150,
        outputTokens: 15,
      });
      expect(Object.keys(stats.models)).toHaveLength(2);
    });

    it('does not lose requests that finish at the same time', async () => {
      const tokens = { inputTokens: 1, outputTokens: 1 };
      await Promise.all(
        Array.from({ length: 10 }, () => recordUsage('openai', 'm', tokens)),
      );
      expect((await getUsage()).models['openai|m'].requests).toBe(10);
    });

    it('never rejects, even without a storage API', async () => {
      globalThis.chrome = {};
      await expect(
        recordUsage('openai', 'm', { inputTokens: 1, outputTokens: 1 }),
      ).resolves.toBeUndefined();
      expect(await getUsage()).toEqual({ since: 0, models: {} });
    });
  });

  it('resets the statistics', async () => {
    await recordUsage('openai', 'm', { inputTokens: 1, outputTokens: 1 });
    await resetUsage();
    expect(await getUsage()).toEqual({ since: 0, models: {} });
  });
});
