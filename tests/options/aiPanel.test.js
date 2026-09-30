// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AI_PROVIDERS } from '../../src/lib/aiProviders.js';
import {
  markActiveProvider,
  renderAiPanel,
  setModelOptions,
  showAiProvider,
} from '../../src/options/aiPanel.js';

describe('aiPanel', () => {
  let select;
  let cards;
  let panels;
  beforeEach(() => {
    globalThis.chrome = { i18n: { getMessage: vi.fn((key) => key) } };
    document.body.innerHTML =
      '<select id="s"></select><div id="c"></div><div id="p"></div>';
    select = document.getElementById('s');
    cards = document.getElementById('c');
    panels = document.getElementById('p');
    renderAiPanel(select, cards, panels);
  });

  it('offers "off" plus every provider as the active AI', () => {
    expect([...select.options].map((o) => o.value)).toEqual([
      'off',
      ...AI_PROVIDERS.map((p) => p.id),
    ]);
  });

  it('renders one tab and one panel per provider', () => {
    const tabs = [...cards.querySelectorAll('[data-provider]')];
    expect(tabs.map((t) => t.dataset.provider)).toEqual(
      AI_PROVIDERS.map((p) => p.id),
    );
    expect(tabs.every((t) => t.getAttribute('role') === 'tab')).toBe(true);
    expect(cards.getAttribute('role')).toBe('tablist');
    expect(panels.children).toHaveLength(AI_PROVIDERS.length);
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

  it('shows only the panel of the viewed provider and marks its tab', () => {
    showAiProvider(cards, panels, 'gemini');
    const visible = [...panels.children].filter(
      (p) => !p.classList.contains('hidden'),
    );
    expect(visible.map((p) => p.id)).toEqual(['ai_panel_gemini']);
    const selected = cards.querySelectorAll('[aria-selected="true"]');
    expect([...selected].map((t) => t.dataset.provider)).toEqual(['gemini']);
  });

  it('viewing a tab does not change the active AI', () => {
    select.value = 'openai';
    markActiveProvider(cards, 'openai');

    showAiProvider(cards, panels, 'claude');

    expect(select.value).toBe('openai');
    expect(cards.querySelector('[data-active="true"]').dataset.provider).toBe(
      'openai',
    );
  });

  it('marks exactly the active AI, and none for "off"', () => {
    markActiveProvider(cards, 'mistral');
    const active = cards.querySelectorAll('[data-active="true"]');
    expect([...active].map((t) => t.dataset.provider)).toEqual(['mistral']);
    expect(active[0].title).toBe('aiActiveMark');

    markActiveProvider(cards, 'off');
    expect(cards.querySelectorAll('[data-active="true"]')).toHaveLength(0);
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
    showAiProvider(cards, panels, 'openai');
    expect(input.type).toBe('password');
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

  it('uses a text input with suggestions for Ollama and custom servers', () => {
    const field = document.getElementById('input_ollamaModel');
    expect(field.tagName).toBe('INPUT');
    setModelOptions(field, [{ id: 'llama3', label: 'llama3' }]);
    expect(document.getElementById('models_ollama').children).toHaveLength(1);
  });
});
