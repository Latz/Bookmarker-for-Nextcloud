// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HINTS_AS_OF } from '../../src/lib/aiHints.js';
import { renderHintsBox } from '../../src/options/aiHintsBox.js';

describe('aiHintsBox', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<aside id="box"></aside>';
    container = document.getElementById('box');
    globalThis.chrome = {
      i18n: {
        getMessage: vi.fn((key, substitutions) =>
          substitutions ? `${key}:${substitutions.join(',')}` : key,
        ),
      },
    };
  });

  const families = () =>
    [...container.querySelectorAll('li')].map((li) => ({
      name: li.querySelector('span').textContent,
      tier: li.dataset.tier,
      label: li.querySelectorAll('span')[1].textContent,
      models: li.querySelector('div:nth-child(2)')?.textContent,
    }));

  it('asks to choose a provider while none is chosen', () => {
    renderHintsBox(container, 'off');
    expect(container.textContent).toContain('aiHintsChoose');
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows the chosen provider with its sentence and a link to its price page', () => {
    renderHintsBox(container, 'openai');

    expect(container.querySelector('h3').textContent).toBe('OpenAI');
    expect(container.textContent).toContain('aiHint_openai');
    const link = container.querySelector('a');
    expect(link.href).toBe('https://developers.openai.com/api/docs/pricing');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.textContent).toBe('aiHintsPrices ↗');
  });

  it('lists the families from the cheapest to the dearest, the cheap ones highlighted', () => {
    renderHintsBox(container, 'claude');

    expect(families()).toEqual([
      { name: 'Haiku', tier: '1', label: 'aiTier1', models: undefined },
      { name: 'Sonnet', tier: '2', label: 'aiTier2', models: undefined },
      { name: 'Opus', tier: '0', label: 'aiTier0', models: undefined },
    ]);
  });

  it('translates the name of a family that has no proper name', () => {
    renderHintsBox(container, 'openai');
    expect(families().map((f) => f.name)).toEqual([
      'nano',
      'mini',
      'aiFamilyFull',
    ]);
  });

  it('sorts the models the provider offers into the families', () => {
    renderHintsBox(container, 'openai', [
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1-nano',
      'o3',
    ]);

    expect(families().map((f) => [f.name, f.models])).toEqual([
      ['nano', 'gpt-5-nano, gpt-4.1-nano'],
      ['mini', 'gpt-5-mini'],
      ['aiFamilyFull', 'gpt-5, o3'],
    ]);
  });

  it('shortens a long list of models', () => {
    renderHintsBox(
      container,
      'openai',
      ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `gpt-${x}-mini`),
    );
    expect(families()[1].models).toBe(
      'gpt-a-mini, gpt-b-mini, gpt-c-mini, gpt-d-mini, +2',
    );
  });

  it('explains the colours, names the date and is drawn again without piling up', () => {
    renderHintsBox(container, 'gemini');
    renderHintsBox(container, 'gemini');

    expect(container.textContent).toContain('aiHintsLegend');
    expect(container.textContent).toContain(`aiHintsNote:${HINTS_AS_OF}`);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('has a sentence but no family list for a provider on your own computer, and no link', () => {
    renderHintsBox(container, 'ollama');

    expect(container.querySelector('h3').textContent).toBe('Ollama');
    expect(container.textContent).toContain('aiHint_ollama');
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelector('a')).toBeNull();
  });
});
