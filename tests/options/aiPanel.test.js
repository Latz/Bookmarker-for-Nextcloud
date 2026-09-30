// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AI_PROVIDERS } from '../../src/lib/aiProviders.js';
import { renderAiPanel, showAiProvider } from '../../src/options/aiPanel.js';

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
      expect(document.getElementById(`models_${p.id}`)).not.toBeNull();
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
    expect(panels.querySelectorAll('.hidden')).toHaveLength(
      AI_PROVIDERS.length,
    );
    expect(cards.querySelector('input[value=off]').checked).toBe(true);
  });
});
