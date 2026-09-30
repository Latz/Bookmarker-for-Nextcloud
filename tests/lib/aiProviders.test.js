// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  AI_PROVIDERS,
  aiProviderDefaults,
  getProvider,
} from '../../src/lib/aiProviders.js';

describe('aiProviders', () => {
  it('has unique ids and a known protocol', () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of AI_PROVIDERS) {
      expect(['anthropic', 'openai']).toContain(p.protocol);
    }
  });

  it('does not use the reserved id "off"', () => {
    expect(getProvider('off')).toBeUndefined();
  });

  it('creates key, model and base URL defaults for every provider', () => {
    const defaults = aiProviderDefaults();
    for (const p of AI_PROVIDERS) {
      expect(defaults[`input_${p.id}ApiKey`]).toBe('');
      expect(defaults[`input_${p.id}Model`]).toBe(p.defaultModel);
      expect(defaults[`input_${p.id}BaseUrl`]).toBe(p.baseUrl);
    }
  });
});
