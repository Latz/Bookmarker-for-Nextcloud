// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HINTS, HINTS_AS_OF } from '../../src/lib/aiHints.js';
import {
  markChosenProvider,
  renderHintsBox,
} from '../../src/options/aiHintsBox.js';

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
    renderHintsBox(container);
  });

  it('has a title, one section per provider and a note with the date', () => {
    expect(container.querySelector('h3').textContent).toBe('aiHintsTitle');
    const sections = [...container.querySelectorAll('section')];
    expect(sections.map((s) => s.dataset.provider)).toEqual(
      HINTS.map((h) => h.id),
    );
    expect(container.lastElementChild.textContent).toBe(
      `aiHintsNote:${HINTS_AS_OF}`,
    );
  });

  it('explains the colours of the model dropdowns', () => {
    expect(container.textContent).toContain('aiHintsLegend');
  });

  it('names the provider and says in a sentence which models are cheap', () => {
    const claude = container.querySelector('section[data-provider="claude"]');
    expect(claude.querySelector('h4').textContent).toBe('Claude');
    expect(claude.querySelector('p').textContent).toBe('aiHint_claude');
  });

  it('links to the price page of the provider, in a new tab', () => {
    const link = container.querySelector('section[data-provider="openai"] a');
    expect(link.href).toBe('https://developers.openai.com/api/docs/pricing');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.textContent).toBe('aiHintsPrices ↗');
  });

  it('has no link for a provider on your own computer', () => {
    expect(
      container.querySelector('section[data-provider="ollama"] a'),
    ).toBeNull();
  });

  it('marks only the chosen provider', () => {
    markChosenProvider(container, 'gemini');
    const marked = [...container.querySelectorAll('[aria-current]')];
    expect(marked.map((s) => s.dataset.provider)).toEqual(['gemini']);
    expect(marked[0].classList.contains('border-info')).toBe(true);

    markChosenProvider(container, 'groq');
    expect(
      [...container.querySelectorAll('[aria-current]')].map(
        (s) => s.dataset.provider,
      ),
    ).toEqual(['groq']);
    expect(
      container
        .querySelector('section[data-provider="gemini"]')
        .classList.contains('border-info'),
    ).toBe(false);
  });

  it('marks nothing for "off"', () => {
    markChosenProvider(container, 'claude');
    markChosenProvider(container, 'off');
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(0);
  });

  it('can be drawn again without piling up sections', () => {
    renderHintsBox(container);
    expect(container.querySelectorAll('section')).toHaveLength(HINTS.length);
  });
});
