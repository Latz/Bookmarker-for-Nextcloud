// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderCheapestModels } from '../../src/options/aiCheapestPanel.js';
import {
  cheapestModels,
  providerOfModel,
  typicalCost,
} from '../../src/lib/aiPricing.js';

describe('providerOfModel', () => {
  it.each([
    ['claude-haiku-4-5', 'claude'],
    ['gpt-5-mini', 'openai'],
    ['o3-mini', 'openai'],
    ['gemini-2.5-flash', 'gemini'],
    ['mistral-small', 'mistral'],
    ['deepseek-flash', 'deepseek'],
    ['llama-3.3-70b', 'groq'],
    ['gpt-oss-120b', 'groq'],
    ['qwen3.8-27b', 'groq'],
    ['something-else', null],
  ])('%s belongs to %s', (model, provider) => {
    expect(providerOfModel(model)).toBe(provider);
  });
});

describe('cheapestModels', () => {
  it('lists at most `limit` models, cheapest first', () => {
    const models = cheapestModels(10);
    expect(models).toHaveLength(10);
    const costs = models.map((m) => typicalCost(m.price));
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it('only has models of providers the extension offers', () => {
    expect(cheapestModels(1000).every((m) => m.provider)).toBe(true);
  });
});

describe('renderCheapestModels', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<aside id="box"></aside>';
    container = document.getElementById('box');
    globalThis.chrome = { i18n: { getMessage: vi.fn((key) => key) } };
    renderCheapestModels(container);
  });

  it('shows a heading, ten rows and a note', () => {
    expect(container.querySelector('h3').textContent).toBe('aiCheapest');
    expect(container.querySelectorAll('li')).toHaveLength(10);
    expect(container.querySelector('p').textContent).toBe('aiCheapestNote');
  });

  it('names the model, its provider and its price in every row', () => {
    const first = container.querySelector('li');
    const entry = cheapestModels(1)[0];
    expect(first.textContent).toContain(entry.model);
    expect(first.textContent).toMatch(/\$\d/);
    expect(first.textContent).toContain(' / ');
  });

  it('marks the cheapest green (1) and the second cheapest yellow (2) only', () => {
    const ranks = [...container.querySelectorAll('li')].map(
      (li) => li.dataset.priceRank,
    );
    expect(ranks).toEqual(['1', '2', ...Array(8).fill(undefined)]);
  });
});
