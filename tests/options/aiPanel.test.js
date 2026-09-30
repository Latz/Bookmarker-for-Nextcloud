// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AI_PROVIDERS } from '../../src/lib/aiProviders.js';
import {
  renderAiPanel,
  setModelOptions,
  showAiProvider,
} from '../../src/options/aiPanel.js';

describe('aiPanel', () => {
  let cards;
  let panels;
  beforeEach(() => {
    globalThis.chrome = { i18n: { getMessage: vi.fn((key) => key) } };
    document.body.innerHTML = '<div id="c"></div><div id="p"></div>';
    cards = document.getElementById('c');
    panels = document.getElementById('p');
    renderAiPanel(cards, panels);
  });

  it('renders an "off" card plus one card and panel per provider', () => {
    const values = [...cards.querySelectorAll('input')].map((i) => i.value);
    expect(values).toEqual(['off', ...AI_PROVIDERS.map((p) => p.id)]);
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
      expect(document.getElementById(`models_${p.id}`) !== null).toBe(
        !!p.freeModel,
      );
    }
  });

  it('shows only the panel of the selected provider', () => {
    showAiProvider(cards, panels, 'gemini');
    const visible = [...panels.children].filter(
      (p) => !p.classList.contains('hidden'),
    );
    expect(visible.map((p) => p.id)).toEqual(['ai_panel_gemini']);
    expect(cards.querySelector('input[value=gemini]').checked).toBe(true);
  });

  it('hides all panels for "off"', () => {
    showAiProvider(cards, panels, 'off');
    expect(
      [...panels.children].every((p) => p.classList.contains('hidden')),
    ).toBe(true);
    expect(cards.querySelector('input[value=off]').checked).toBe(true);
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
