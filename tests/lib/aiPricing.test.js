// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  formatPrice,
  getPrice,
} from '../../src/lib/aiPricing.js';

describe('aiPricing', () => {
  it('matches the longest model prefix', () => {
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.25,
      output: 2,
    });
    expect(getPrice('openai', 'gpt-5')).toEqual({ input: 1.25, output: 10 });
    expect(getPrice('openai', 'gpt-4o-mini-2024-07-18')).toEqual({
      input: 0.15,
      output: 0.6,
    });
  });

  it('finds dated Claude ids and OpenRouter vendor prefixes', () => {
    expect(getPrice('claude', 'claude-haiku-4-5-20251001')).toEqual({
      input: 1,
      output: 5,
    });
    expect(getPrice('openrouter', 'openai/gpt-5-mini')).toEqual({
      input: 0.25,
      output: 2,
    });
  });

  it('is free for Ollama and unknown for unlisted models', () => {
    expect(estimateCost('ollama', 'llama3', 1e6, 1e6)).toBe(0);
    expect(getPrice('custom', 'my-model')).toBeNull();
    expect(estimateCost('custom', 'my-model', 1, 1)).toBeNull();
  });

  it('computes the cost from input and output tokens', () => {
    // 2M input tokens at $1 + 1M output tokens at $5
    expect(estimateCost('claude', 'claude-haiku-4-5', 2e6, 1e6)).toBeCloseTo(7);
  });

  it('formats a price pair for the dropdowns', () => {
    expect(formatPrice({ input: 0.25, output: 2 })).toBe('$0.25 / $2');
    expect(formatPrice({ input: 1.6, output: 10 })).toBe('$1.60 / $10');
    expect(formatPrice({ input: 0.0625, output: 0.5 })).toBe('$0.0625 / $0.50');
  });
});
