// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { modelTier } from '../../src/lib/aiTiers.js';

describe('modelTier', () => {
  it.each([
    // [provider, model, tier]
    ['claude', 'claude-haiku-4-5-20251001', 1],
    ['claude', 'claude-3-5-haiku-20241022', 1],
    ['claude', 'claude-sonnet-5-5', 2],
    ['claude', 'claude-opus-5-5', 0],
    ['openai', 'gpt-5-nano', 1],
    ['openai', 'gpt-4.1-nano', 1],
    ['openai', 'gpt-5-mini', 2],
    ['openai', 'o3-mini', 2],
    ['openai', 'gpt-5', 0],
    ['gemini', 'gemini-2.5-flash-lite', 1],
    ['gemini', 'models/gemini-3.1-flash-lite', 1],
    ['gemini', 'gemini-2.5-flash', 2],
    ['gemini', 'gemini-2.5-pro', 0],
    ['mistral', 'ministral-3b-2512', 1],
    ['mistral', 'mistral-small-2603', 1],
    ['mistral', 'mistral-large-2512', 2],
    ['mistral', 'mistral-medium-3-5', 0],
    ['groq', 'openai/gpt-oss-20b', 1],
    ['groq', 'openai/gpt-oss-120b', 2],
    ['groq', 'llama-3.3-70b-versatile', 0],
    ['deepseek', 'deepseek-flash', 1],
    ['deepseek', 'deepseek-v4-pro', 2],
    ['openrouter', 'meta-llama/llama-3.3-70b-instruct:free', 1],
    ['openrouter', 'openai/gpt-5-mini', 0],
  ])('%s %s is tier %i', (provider, model, tier) => {
    expect(modelTier(provider, model)).toBe(tier);
  });

  it('the cheaper family wins when a name fits both ("flash-lite" contains "flash")', () => {
    expect(modelTier('gemini', 'gemini-3.5-flash-lite')).toBe(1);
  });

  it('colours nothing for local and custom servers or an unknown provider', () => {
    expect(modelTier('ollama', 'llama3-mini')).toBe(0);
    expect(modelTier('custom', 'something-nano')).toBe(0);
    expect(modelTier('nobody', 'haiku')).toBe(0);
  });

  it('is not case sensitive and tolerates odd input', () => {
    expect(modelTier('openai', 'GPT-5-NANO')).toBe(1);
    expect(modelTier('openai', undefined)).toBe(0);
  });
});
