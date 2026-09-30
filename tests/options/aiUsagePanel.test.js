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
  renderAiUsage,
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

  it('says so when nothing was used yet', async () => {
    getUsage.mockResolvedValue({ since: 0, models: {} });
    await renderAiUsage(container);
    expect(container.textContent).toContain('aiUsageEmpty');
    expect(container.querySelector('table')).toBeNull();
  });

  it('lists every provider in its own section with its models', async () => {
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
        'custom|mine': entry('custom', 'mine', 1, 5, 5),
      },
    });

    await renderAiUsage(container);

    const sections = [...container.querySelectorAll('section')];
    expect(sections.map((s) => s.dataset.provider)).toEqual([
      'claude',
      'custom',
    ]);
    expect(sections[0].querySelector('h4').textContent).toBe('Claude');
    const claudeRows = [...sections[0].querySelectorAll('tbody tr')];
    expect(claudeRows.map((r) => r.firstChild.textContent)).toEqual([
      'claude-haiku-4-5',
      'claude-sonnet-5-5',
    ]);
    expect(claudeRows[0].textContent).toContain('≈ $1.50'); // $1 + 100k * $5/M
    // a provider with several models has its own total row
    expect(sections[0].querySelector('tfoot').textContent).toContain('≈ $3.50');
    // one model: no total row; unknown price shows a dash
    expect(sections[1].querySelector('tfoot')).toBeNull();
    expect(sections[1].querySelector('tbody').textContent).toContain('–');
  });

  it('adds a grand total over all providers', async () => {
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
        'custom|mine': entry('custom', 'mine', 1, 5, 5),
      },
    });

    await renderAiUsage(container);

    const total = [...container.children].find((el) => el.tagName === 'TABLE');
    expect(total.textContent).toContain('aiUsageTotalAll');
    expect(total.textContent).toContain('3'); // requests
    expect(total.textContent).toContain('≈ $1.50+'); // "+": an unpriced model
  });

  it('has no grand total for a single provider', async () => {
    getUsage.mockResolvedValue({
      since: Date.now(),
      models: { 'openai|gpt-5-mini': entry('openai', 'gpt-5-mini', 1, 1, 1) },
    });

    await renderAiUsage(container);

    expect(container.textContent).not.toContain('aiUsageTotalAll');
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  it('resets the statistics with the button', async () => {
    getUsage.mockResolvedValue({
      since: 1,
      models: { 'openai|m': entry('openai', 'm', 1, 1, 1) },
    });
    await renderAiUsage(container);

    container.querySelector('#btn_resetAiUsage').click();

    expect(resetUsage).toHaveBeenCalled();
  });

  it('re-renders when the statistics change', () => {
    getUsage.mockResolvedValue({ since: 0, models: {} });
    initAiUsage(container);
    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    getUsage.mockClear();

    listener({ other: {} }, 'local');
    listener({ aiUsage: {} }, 'sync');
    expect(getUsage).not.toHaveBeenCalled();
    listener({ aiUsage: {} }, 'local');
    expect(getUsage).toHaveBeenCalledTimes(1);
  });

  it('formats small sums with more decimals', () => {
    expect(formatCost(0.00123)).toContain('0.0012');
    expect(formatCost(12.3456)).toContain('12.35');
  });
});
