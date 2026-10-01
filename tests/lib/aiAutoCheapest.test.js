// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { chooseCheapest, findOffered } from '../../src/lib/aiAutoCheapest.js';

describe('findOffered', () => {
  const offered = [
    'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-20241022',
    'gpt-5-mini',
    'gpt-5-mini-2025-08-07',
  ];

  it('prefers an exact match, then the first id that starts with the name', () => {
    expect(findOffered(offered, 'gpt-5-mini')).toBe('gpt-5-mini');
    expect(findOffered(offered, 'claude-3-5-haiku')).toBe(
      'claude-3-5-haiku-20241022',
    );
  });

  it('is null when the provider offers nothing like it', () => {
    expect(findOffered(offered, 'gemini-2.5-flash')).toBeNull();
    expect(findOffered([], 'gpt-5-mini')).toBeNull();
  });
});

describe('chooseCheapest', () => {
  // typical request (10 input + 1 output token per million):
  // gpt-5 22.5, gpt-5-mini 4.5, gpt-5-nano 0.9, claude-haiku-4-5 15,
  // claude-opus-5-5 60, gpt-oss-20b (Groq) 1.05
  const offered = {
    openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
    claude: ['claude-opus-5-5-20260922', 'claude-haiku-4-5-20251001'],
  };

  it('takes the cheapest model of all providers with a key', () => {
    expect(
      chooseCheapest(
        { provider: 'claude', model: 'claude-opus-5-5-x' },
        offered,
      ),
    ).toEqual({ provider: 'openai', model: 'gpt-5-nano' });
  });

  it('can switch to another provider than the one in use', () => {
    const choice = chooseCheapest(
      { provider: 'openai', model: 'gpt-5' },
      { claude: offered.claude, openai: ['gpt-5'] },
    );
    expect(choice).toEqual({
      provider: 'claude',
      model: 'claude-haiku-4-5-20251001',
    });
  });

  it('only considers providers it was given models for (those with a key)', () => {
    // the cheap OpenAI models are not offered: no key, no list
    expect(
      chooseCheapest(
        { provider: 'claude', model: 'claude-opus-5-5-x' },
        { claude: offered.claude },
      ),
    ).toEqual({ provider: 'claude', model: 'claude-haiku-4-5-20251001' });
  });

  it('only takes models the provider really offers', () => {
    expect(
      chooseCheapest(
        { provider: 'openai', model: 'gpt-5' },
        { openai: ['gpt-5', 'gpt-5-mini'] },
      ),
    ).toEqual({ provider: 'openai', model: 'gpt-5-mini' });
  });

  it('is null when the model in use is already the cheapest', () => {
    expect(
      chooseCheapest({ provider: 'openai', model: 'gpt-5-nano' }, offered),
    ).toBeNull();
  });

  it('is null when the saving is under 10 %', () => {
    // gpt-5-nano costs 0.9; gpt-4.1-nano 1.4 is dearer, gpt-oss-20b 1.05 too
    expect(
      chooseCheapest(
        { provider: 'openai', model: 'gpt-4.1-nano' },
        { openai: ['gpt-4.1-nano'], groq: ['openai/gpt-oss-20b'] },
      ),
    ).toBeNull();
  });

  it('is null when the model in use has no known price', () => {
    expect(
      chooseCheapest({ provider: 'openai', model: 'my-own-model' }, offered),
    ).toBeNull();
  });

  it('does not take a dearer real id for a cheap name of the list', () => {
    // "claude-opus-4" (15/75) would find "claude-opus-4-5-..." (5/25) first,
    // which is cheaper, but "claude-opus-4-1-..." (15/75) must not be taken
    // for a candidate cheaper than the model in use
    expect(
      chooseCheapest(
        { provider: 'claude', model: 'claude-opus-4-1-20250805' },
        { claude: ['claude-opus-4-1-20250805'] },
      ),
    ).toBeNull();
  });
});
