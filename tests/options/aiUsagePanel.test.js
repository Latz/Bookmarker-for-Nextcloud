// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/aiUsage.js', () => ({
  getUsage: vi.fn(),
  resetUsage: vi.fn(),
  USAGE_STORAGE_KEY: 'aiUsage',
}));

import { getUsage, resetUsage } from '../../src/lib/aiUsage.js';
import {
  formatCost,
  initAiUsage,
  renderProviderUsage,
} from '../../src/options/aiUsagePanel.js';

const entry = (provider, model, requests, inputTokens, outputTokens) => ({
  provider,
  model,
  requests,
  inputTokens,
  outputTokens,
});

describe('aiUsagePanel', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c');
    globalThis.chrome = {
      i18n: { getMessage: vi.fn((key) => key) },
      storage: { onChanged: { addListener: vi.fn() } },
    };
  });

  it('says so when the provider was not used yet', async () => {
    getUsage.mockResolvedValue({
      since: 1,
      models: { 'openai|m': entry('openai', 'm', 1, 1, 1) },
    });

    await renderProviderUsage(container, 'claude');

    expect(container.textContent).toContain('aiUsageEmpty');
    expect(container.querySelector('table')).toBeNull();
  });

  it("shows only the usage of the provider's own panel", async () => {
    getUsage.mockResolvedValue({
      since: Date.now(),
      models: {
        'openai|gpt-5-mini': entry('openai', 'gpt-5-mini', 4, 1000, 100),
        'claude|claude-haiku-4-5': entry(
          'claude',
          'claude-haiku-4-5',
          2,
          50,
          5,
        ),
      },
    });

    await renderProviderUsage(container, 'claude');

    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(1);
    expect(rows[0].firstChild.textContent).toBe('claude-haiku-4-5');
    expect(container.textContent).not.toContain('gpt-5-mini');
  });

  it('lists the models with tokens and estimated cost, plus a total', async () => {
    getUsage.mockResolvedValue({
      since: Date.now(),
      models: {
        'claude|claude-haiku-4-5': entry(
          'claude',
          'claude-haiku-4-5',
          2,
          1000000,
          100000,
        ),
        'claude|claude-sonnet-5-5': entry(
          'claude',
          'claude-sonnet-5-5',
          1,
          1000000,
          0,
        ),
      },
    });

    await renderProviderUsage(container, 'claude');

    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.firstChild.textContent)).toEqual([
      'claude-haiku-4-5',
      'claude-sonnet-5-5',
    ]);
    expect(rows[0].textContent).toContain('≈ $1.50'); // $1 + 100k * $5/M
    expect(container.querySelector('tfoot').textContent).toContain('≈ $3.50');
  });

  it('has no total row for a single model, and a dash for an unknown price', async () => {
    getUsage.mockResolvedValue({
      since: Date.now(),
      models: { 'custom|mine': entry('custom', 'mine', 1, 5, 5) },
    });

    await renderProviderUsage(container, 'custom');

    expect(container.querySelector('tfoot')).toBeNull();
    expect(container.querySelector('tbody').textContent).toContain('–');
  });

  it('resets only this provider with its button', async () => {
    getUsage.mockResolvedValue({
      since: 1,
      models: { 'openai|m': entry('openai', 'm', 1, 1, 1) },
    });
    await renderProviderUsage(container, 'openai');

    container.querySelector('#btn_resetAiUsage_openai').click();

    expect(resetUsage).toHaveBeenCalledWith('openai');
  });

  describe('initAiUsage', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<div id="ai_usage_openai"></div><div id="ai_usage_claude"></div>';
      getUsage.mockResolvedValue({
        since: 1,
        models: { 'openai|m': entry('openai', 'm', 1, 1, 1) },
      });
    });

    it('fills the box of every provider panel with that provider only', async () => {
      initAiUsage();
      await vi.waitFor(() =>
        expect(
          document.getElementById('ai_usage_claude').textContent,
        ).toContain('aiUsageEmpty'),
      );
      expect(
        document.getElementById('ai_usage_openai').querySelector('table'),
      ).not.toBeNull();
    });

    it('re-renders when the statistics change', async () => {
      initAiUsage();
      const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
      await vi.waitFor(() => expect(getUsage).toHaveBeenCalled());
      getUsage.mockClear();

      listener({ other: {} }, 'local');
      listener({ aiUsage: {} }, 'sync');
      expect(getUsage).not.toHaveBeenCalled();
      listener({ aiUsage: {} }, 'local');
      expect(getUsage).toHaveBeenCalled();
    });
  });

  it('formats small sums with more decimals', () => {
    expect(formatCost(0.00123)).toContain('0.0012');
    expect(formatCost(12.3456)).toContain('12.35');
  });
});
