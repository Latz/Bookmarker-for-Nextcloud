// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AI_PROVIDERS } from '../../src/lib/aiProviders.js';
import {
  priceRanks,
  renderAiPanel,
  resolveModelId,
  setModelOptions,
  showAiProvider,
} from '../../src/options/aiPanel.js';

describe('aiPanel', () => {
  let select;
  let panels;
  beforeEach(() => {
    globalThis.chrome = { i18n: { getMessage: vi.fn((key) => key) } };
    document.body.innerHTML = '<select id="s"></select><div id="p"></div>';
    select = document.getElementById('s');
    panels = document.getElementById('p');
    renderAiPanel(select, panels);
  });

  it('offers "off" plus every provider to choose from', () => {
    expect([...select.options].map((o) => o.value)).toEqual([
      'off',
      ...AI_PROVIDERS.map((p) => p.id),
    ]);
  });

  it('renders one panel per provider and no provider buttons', () => {
    expect(panels.children).toHaveLength(AI_PROVIDERS.length);
    expect(document.querySelectorAll('button[data-provider]')).toHaveLength(0);
  });

  it('creates the key, model and base URL fields of every provider', () => {
    for (const p of AI_PROVIDERS) {
      for (const field of ['ApiKey', 'Model', 'BaseUrl']) {
        expect(document.getElementById(`input_${p.id}${field}`)).not.toBeNull();
      }
      expect(document.getElementById(`btn_${p.id}Models`)).not.toBeNull();
      expect(document.getElementById(`btn_${p.id}Test`)).not.toBeNull();
      expect(document.getElementById(`ai_test_${p.id}`)).not.toBeNull();
      expect(document.getElementById(`ai_usage_${p.id}`)).not.toBeNull();
      expect(document.getElementById(`models_${p.id}`) !== null).toBe(
        !!p.freeModel,
      );
    }
  });

  it('shows only the panel of the chosen provider', () => {
    showAiProvider(panels, 'gemini');
    const visible = [...panels.children].filter(
      (p) => !p.classList.contains('hidden'),
    );
    expect(visible.map((p) => p.id)).toEqual(['ai_panel_gemini']);

    showAiProvider(panels, 'claude');
    expect(
      [...panels.children].filter((p) => !p.classList.contains('hidden')),
    ).toHaveLength(1);
  });

  it('shows no panel for "off"', () => {
    showAiProvider(panels, 'gemini');
    showAiProvider(panels, 'off');
    expect(
      [...panels.children].every((p) => p.classList.contains('hidden')),
    ).toBe(true);
  });

  it('toggles the API key between hidden and visible with the eye button', () => {
    const input = document.getElementById('input_claudeApiKey');
    const button = input.parentElement.querySelector('.ai-eye');
    expect(input.type).toBe('password');
    button.click();
    expect(input.type).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('aiHideKey');
    expect(
      button.querySelector('.ai-eye-slash').classList.contains('hidden'),
    ).toBe(false);
    button.click();
    expect(input.type).toBe('password');
    expect(button.getAttribute('aria-label')).toBe('aiShowKey');
  });

  it('hides visible keys again when a provider card is selected', () => {
    const input = document.getElementById('input_claudeApiKey');
    input.parentElement.querySelector('.ai-eye').click();
    showAiProvider(panels, 'openai');
    expect(input.type).toBe('password');
  });

  it('marks the key of a provider that works without one as optional in its placeholder', () => {
    expect(document.getElementById('input_customApiKey').placeholder).toBe(
      'aiKeyOptional',
    );
    expect(document.getElementById('input_claudeApiKey').placeholder).toBe('');
  });

  it('has no eye button for the hidden key field of Ollama', () => {
    const input = document.getElementById('input_ollamaApiKey');
    expect(input.type).toBe('hidden');
    expect(input.parentElement.querySelector('.ai-eye')).toBeNull();
  });

  it('uses a dropdown with the default model for regular providers', () => {
    const field = document.getElementById('input_openaiModel');
    expect(field.tagName).toBe('SELECT');
    expect(field.value).toBe('gpt-5-mini');
  });

  it('keeps the current model selectable when a list is loaded', () => {
    const field = document.getElementById('input_openaiModel');
    setModelOptions(field, [
      { id: 'gpt-4.1', label: 'gpt-4.1' },
      { id: 'o3-mini', label: 'o3-mini' },
    ]);
    expect([...field.options].map((o) => o.value)).toEqual([
      'gpt-5-mini',
      'gpt-4.1',
      'o3-mini',
    ]);
    setModelOptions(field, [{ id: 'gpt-4.1', label: 'gpt-4.1' }], 'gpt-4.1');
    expect(field.value).toBe('gpt-4.1');
    expect(field.options).toHaveLength(1);
  });

  it('shows the price per million tokens in the model dropdown', () => {
    const field = document.getElementById('input_openaiModel');
    setModelOptions(field, [
      { id: 'gpt-5-mini', label: 'gpt-5-mini' },
      { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { id: 'brand-new-model', label: 'brand-new-model' },
    ]);

    const labels = [...field.options].map((o) => o.textContent);
    expect(labels).toEqual([
      'gpt-5-mini  ·  $0.25 / $2',
      'gpt-4.1-mini  ·  $0.40 / $1.60',
      'brand-new-model',
    ]);
    // the value stays the plain model id
    expect([...field.options].map((o) => o.value)).toEqual([
      'gpt-5-mini',
      'gpt-4.1-mini',
      'brand-new-model',
    ]);
  });

  describe('price colours', () => {
    const ids = (...list) => list.map((id) => ({ id, label: id }));

    it('ranks by the cost of a typical request: cheapest 1, second cheapest 2', () => {
      // typical request = 10 input tokens + 1 output token (per million):
      // gpt-5-mini 2.5+2=4.5, gpt-4.1-mini 4+1.6=5.6, gpt-5-nano 0.5+0.4=0.9,
      // gpt-5 12.5+10=22.5
      const ranks = priceRanks(
        ids('gpt-5-mini', 'gpt-4.1-mini', 'gpt-5-nano', 'gpt-5'),
        'openai',
      );
      expect(ranks.get('gpt-5-nano')).toBe(1);
      expect(ranks.get('gpt-5-mini')).toBe(2);
      expect(ranks.has('gpt-4.1-mini')).toBe(false);
      expect(ranks.has('gpt-5')).toBe(false);
    });

    it('gives models with the same price the same rank and skips unknown prices', () => {
      const ranks = priceRanks(
        ids(
          'claude-sonnet-4-6',
          'claude-sonnet-4-5',
          'mystery',
          'claude-haiku-4-5',
        ),
        'claude',
      );
      expect(ranks.get('claude-haiku-4-5')).toBe(1);
      expect(ranks.get('claude-sonnet-4-6')).toBe(2);
      expect(ranks.get('claude-sonnet-4-5')).toBe(2);
      expect(ranks.has('mystery')).toBe(false);
    });

    it('marks the options and copies the selected rank onto the closed dropdown', () => {
      const field = document.getElementById('input_openaiModel');
      setModelOptions(
        field,
        ids('gpt-5-mini', 'gpt-4.1-mini', 'gpt-5-nano', 'gpt-5'),
        'gpt-5-nano',
      );

      const rank = (id) =>
        [...field.options].find((o) => o.value === id).dataset.priceRank;
      expect(rank('gpt-5-nano')).toBe('1');
      expect(rank('gpt-5-mini')).toBe('2');
      expect(rank('gpt-4.1-mini')).toBeUndefined();
      expect(rank('gpt-5')).toBeUndefined();
      expect(field.dataset.priceRank).toBe('1');

      field.value = 'gpt-5-mini';
      field.dispatchEvent(new Event('change'));
      expect(field.dataset.priceRank).toBe('2');

      field.value = 'gpt-5';
      field.dispatchEvent(new Event('change'));
      expect(field.dataset.priceRank).toBeUndefined();
    });

    it('colours nothing in the suggestions of text-input providers', () => {
      const field = document.getElementById('input_ollamaModel');
      setModelOptions(field, ids('llama3', 'qwen'));
      expect(
        document.querySelectorAll('#models_ollama [data-price-rank]'),
      ).toHaveLength(0);
    });
  });

  it('also shows the price of a stored model that is not in the list', () => {
    const field = document.getElementById('input_claudeModel');
    setModelOptions(field, [], 'claude-haiku-4-5');
    expect(field.options[0].textContent).toBe('claude-haiku-4-5  ·  $1 / $5');
  });

  it('does not put prices into the suggestions of text-input providers', () => {
    const field = document.getElementById('input_ollamaModel');
    setModelOptions(field, [{ id: 'llama3', label: 'llama3' }]);
    expect(
      document.getElementById('models_ollama').firstChild.textContent,
    ).toBe('llama3');
  });

  it('uses a text input with suggestions for Ollama and custom servers', () => {
    const field = document.getElementById('input_ollamaModel');
    expect(field.tagName).toBe('INPUT');
    setModelOptions(field, [{ id: 'llama3', label: 'llama3' }]);
    expect(document.getElementById('models_ollama').children).toHaveLength(1);
  });

  describe('resolveModelId', () => {
    const offered = [
      'claude-haiku-4-5-20251001',
      'claude-3-5-haiku-20241022',
      'claude-3-5-haiku-20240307',
      'gpt-5-mini',
      'gpt-5-mini-2025-08-07',
    ];

    it('prefers an exact match', () => {
      expect(resolveModelId(offered, 'gpt-5-mini')).toBe('gpt-5-mini');
    });

    it('takes the first offered id that starts with the name (newest first)', () => {
      expect(resolveModelId(offered, 'claude-3-5-haiku')).toBe(
        'claude-3-5-haiku-20241022',
      );
      expect(resolveModelId(offered, 'claude-haiku-4-5')).toBe(
        'claude-haiku-4-5-20251001',
      );
    });

    it('uses the name itself when nothing offered fits (no list loaded)', () => {
      expect(resolveModelId([], 'gpt-5-nano')).toBe('gpt-5-nano');
      expect(resolveModelId(offered, 'unknown-model')).toBe('unknown-model');
    });
  });
});
