// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addUpdateFooter,
  formatTokens,
  modelTooltip,
  renderCheapestModels,
} from '../../src/options/aiCheapestPanel.js';
import { getModelInfo } from '../../src/lib/aiModelInfo.js';
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
    ['ministral-14b', 'mistral'],
    ['codestral', 'mistral'],
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

  it('picks the provider and model of a row when it is clicked', () => {
    const onPick = vi.fn();
    renderCheapestModels(container, onPick);
    const entries = cheapestModels(10);

    const rows = container.querySelectorAll('li');
    expect(rows).toHaveLength(10);
    rows[3].click();

    expect(onPick).toHaveBeenCalledWith(entries[3].provider, entries[3].model);
    expect(rows[3].dataset.provider).toBe(entries[3].provider);
    expect(rows[3].dataset.model).toBe(entries[3].model);
    expect(rows[3].title).toBe('aiCheapestPick');
  });

  it('can be shown without a click handler', () => {
    renderCheapestModels(container);
    expect(() => container.querySelector('li').click()).not.toThrow();
  });

  it('marks the cheapest green (1) and the second cheapest yellow (2) only', () => {
    const ranks = [...container.querySelectorAll('li')].map(
      (li) => li.dataset.priceRank,
    );
    expect(ranks).toEqual(['1', '2', ...Array(8).fill(undefined)]);
  });
});

describe('formatTokens', () => {
  it.each([
    [1_000_000, '1M'],
    [1_048_576, '1.05M'],
    [400_000, '400K'],
    [131_072, '131K'],
    [512, '512'],
  ])('%i is %s', (tokens, text) => {
    expect(formatTokens(tokens)).toBe(text);
  });
});

describe('modelTooltip', () => {
  const t = (key) => key;

  it('has one line per detail that is known', () => {
    expect(
      modelTooltip(
        {
          description: 'A compact model.',
          context: 400000,
          maxOutput: 128000,
          released: '2025-08-07',
          modalities: 'text, image',
          cachedInput: 0.025,
          speed: 500,
        },
        t,
      ).split('\n'),
    ).toEqual([
      'A compact model.',
      'aiInfoContext: 400K · aiInfoMaxOutput: 128K',
      'aiInfoReleased: 2025-08-07',
      'aiInfoInputs: text, image',
      'aiInfoCached: $0.025 / 1M',
      'aiInfoSpeed: 500 tokens/s',
    ]);
  });

  it('leaves out what is not known', () => {
    expect(modelTooltip({ context: 131072 }, t)).toBe('aiInfoContext: 131K');
    expect(modelTooltip({}, t)).toBe('');
  });
});

describe('info icon in the rows', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<aside id="box"></aside>';
    container = document.getElementById('box');
    globalThis.chrome = { i18n: { getMessage: vi.fn((key) => key) } };
  });

  it('sits behind the model name of every row with known details', () => {
    renderCheapestModels(container);
    const rows = [...container.querySelectorAll('li')];
    const withInfo = rows.filter((li) => getModelInfo(li.dataset.model));
    expect(withInfo.length).toBeGreaterThan(0);

    for (const li of withInfo) {
      const icon = li.querySelector('[role="img"]');
      expect(icon).not.toBeNull();
      expect(icon.title).toBe(
        modelTooltip(getModelInfo(li.dataset.model), (k) => k),
      );
      expect(icon.querySelector('svg')).not.toBeNull();
      // right behind the model name, before the provider
      expect(icon.previousElementSibling.textContent).toBe(li.dataset.model);
    }
  });

  it('shows no icon for a row without details', () => {
    renderCheapestModels(container);
    const without = [...container.querySelectorAll('li')].filter(
      (li) => !getModelInfo(li.dataset.model),
    );
    for (const li of without) {
      expect(li.querySelector('[role="img"]')).toBeNull();
    }
  });

  it('does not pick the model when the icon is clicked', () => {
    const onPick = vi.fn();
    renderCheapestModels(container, onPick);
    const icon = container.querySelector('li [role="img"]');

    icon.click();
    expect(onPick).not.toHaveBeenCalled();

    icon.closest('li').click();
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('picks the model with Enter or Space on a row', () => {
    const onPick = vi.fn();
    renderCheapestModels(container, onPick);
    const row = container.querySelector('li');

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(onPick).toHaveBeenCalledTimes(2);
    expect(row.getAttribute('role')).toBe('button');
    expect(row.tabIndex).toBe(0);
  });
});

describe('update footer', () => {
  let container;
  let getStatus;
  let runUpdate;

  const setup = async () => {
    const refresh = addUpdateFooter(container, { getStatus, runUpdate });
    await refresh();
    return refresh;
  };
  const click = async () => {
    container.querySelector('#btn_updateCheapest').click();
    await vi.waitFor(() =>
      expect(container.querySelector('#btn_updateCheapest').disabled).toBe(
        false,
      ),
    );
  };

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
    getStatus = vi.fn().mockResolvedValue({
      last: Date.UTC(2026, 9, 1, 12, 0),
      next: Date.UTC(2026, 9, 8, 12, 0),
    });
    runUpdate = vi.fn().mockResolvedValue({});
  });

  it('shows the last and the next update, and an update button', async () => {
    await setup();

    const text = container.textContent;
    expect(text).toContain('aiUpdateLast: ');
    expect(text).toContain('aiUpdateNext: ');
    expect(text).toMatch(/2026/);
    const button = container.querySelector('#btn_updateCheapest');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.title).toBe('aiUpdateNow');
    expect(button.getAttribute('aria-label')).toBe('aiUpdateNow');
  });

  it('shows a dash for times that are not known', async () => {
    getStatus.mockResolvedValue({ last: null, next: null });
    await setup();
    expect(container.textContent).toContain('aiUpdateLast: aiUpdateNone');
    expect(container.textContent).toContain('aiUpdateNext: aiUpdateNone');
  });

  it('updates on a click: runs the check, spins meanwhile and reads the times again', async () => {
    let finish;
    runUpdate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await setup();
    getStatus.mockClear();

    const button = container.querySelector('#btn_updateCheapest');
    button.click();
    await vi.waitFor(() => expect(button.disabled).toBe(true));
    expect(button.querySelector('svg').classList.contains('animate-spin')).toBe(
      true,
    );
    expect(container.querySelector('[role="status"]').textContent).toBe(
      'aiUpdateRunning',
    );

    finish({});
    await vi.waitFor(() => expect(button.disabled).toBe(false));

    expect(runUpdate).toHaveBeenCalledTimes(1);
    expect(button.querySelector('svg').classList.contains('animate-spin')).toBe(
      false,
    );
    expect(getStatus).toHaveBeenCalled();
  });

  it.each([
    ['nothing cheaper', {}, 'aiUpdateNothing'],
    [
      'a cheaper model',
      { cheaper: { id: 'gpt-5-nano' } },
      'aiUpdateCheaper:gpt-5-nano',
    ],
    [
      'a switch',
      { switched: { model: 'gpt-5-nano', providerLabel: 'OpenAI' } },
      'aiAutoDone:gpt-5-nano,OpenAI',
    ],
    ['an error', { error: 'boom' }, 'boom'],
  ])('says what came of it: %s', async (_name, outcome, text) => {
    runUpdate.mockResolvedValue(outcome);
    await setup();
    await click();
    expect(container.querySelector('[role="status"]').textContent).toBe(text);
  });

  it('survives an update that throws', async () => {
    runUpdate.mockRejectedValue(new Error('no connection'));
    await setup();
    await click();
    expect(container.querySelector('[role="status"]').textContent).toBe(
      'no connection',
    );
  });
});
