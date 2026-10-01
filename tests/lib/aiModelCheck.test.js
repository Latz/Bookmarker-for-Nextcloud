// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { findCheaperModel } from '../../src/lib/aiModelCheck.js';

const list = (...ids) => ids.map((id) => ({ id }));

describe('findCheaperModel', () => {
  it('finds the cheapest model that costs clearly less than the selected one', () => {
    // typical request (10 input + 1 output): gpt-5 22.5, gpt-5-mini 4.5,
    // gpt-4.1-mini 5.6, gpt-5-nano 0.9
    const result = findCheaperModel(
      'openai',
      'gpt-5',
      list('gpt-5', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-5-nano'),
    );
    expect(result.id).toBe('gpt-5-nano');
    expect(result.price).toEqual({ input: 0.05, output: 0.4 });
    expect(result.selectedPrice).toEqual({ input: 1.25, output: 10 });
  });

  it('is null when the selected model is already the cheapest', () => {
    expect(
      findCheaperModel(
        'openai',
        'gpt-5-nano',
        list('gpt-5-nano', 'gpt-5', 'gpt-5-mini'),
      ),
    ).toBeNull();
  });

  it('ignores models that cost the same or more', () => {
    // the two Sonnet versions have the same price
    expect(
      findCheaperModel(
        'claude',
        'claude-sonnet-4-6',
        list('claude-sonnet-4-5', 'claude-opus-5-5'),
      ),
    ).toBeNull();
    // gpt-5-mini (4.5) is 20 % cheaper than gpt-4.1-mini (5.6): worth a message
    expect(
      findCheaperModel('openai', 'gpt-4.1-mini', list('gpt-5-mini')).id,
    ).toBe('gpt-5-mini');
  });

  it('leaves out models whose price is not known', () => {
    expect(
      findCheaperModel('openai', 'gpt-5', list('mystery-model', 'gpt-5-mini'))
        .id,
    ).toBe('gpt-5-mini');
    expect(
      findCheaperModel('openai', 'gpt-5', list('mystery-model')),
    ).toBeNull();
  });

  it('has nothing to compare with when the selected model has no known price', () => {
    expect(
      findCheaperModel('openai', 'my-own-model', list('gpt-5-nano')),
    ).toBeNull();
  });

  it('uses the label of the model if it has one', () => {
    const result = findCheaperModel('claude', 'claude-opus-5-5', [
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ]);
    expect(result.label).toBe('Claude Haiku 4.5');
  });

  it('never suggests anything for a free local provider', () => {
    expect(
      findCheaperModel('ollama', 'llama3', list('llama3', 'qwen')),
    ).toBeNull();
  });
});
