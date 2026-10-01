// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/background/modules/browser/getBrowserTheme.js', () => ({
  ensureOffscreenDocument: vi.fn(() => Promise.resolve()),
}));

import { ensureOffscreenDocument } from '../../src/background/modules/browser/getBrowserTheme.js';
import { updatePrices } from '../../src/background/modules/ai/priceUpdate.js';
import { AI_DATA_KEY, applyAiData } from '../../src/lib/aiData.js';
import { getPrice } from '../../src/lib/aiPricing.js';
import { SOURCES } from '../../src/lib/aiPriceSources.js';
import { TEST_INFO, TEST_PRICES } from '../fixtures/aiPrices.js';
import { getModelInfo } from '../../src/lib/aiModelInfo.js';

const row = (prefix, input, output, source, info) => ({
  prefix,
  input,
  output,
  source,
  ...(info ? { info } : {}),
});

describe('updatePrices', () => {
  let store;
  let answers; // source name -> what the offscreen document answers

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // what the extension has saved from earlier updates
    store = {
      [AI_DATA_KEY]: {
        prices: TEST_PRICES,
        info: TEST_INFO,
        generated: '2026-09-01',
      },
    };
    answers = {
      openai: {
        rows: [row('gpt-5-mini', 0.3, 2.5, 'openai', { cachedInput: 0.03 })],
      },
      anthropic: {
        rows: [row('claude-opus-9', 1, 5, 'anthropic', { context: 2_000_000 })],
      },
    };
    globalThis.chrome = {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: store[key] })),
          set: vi.fn(async (values) => Object.assign(store, values)),
        },
        onChanged: { addListener: vi.fn() },
      },
      runtime: {
        sendMessage: vi.fn(async ({ name }) => {
          const source = SOURCES.find((s) => s.name === name);
          return {
            name,
            url: source.url,
            official: source.official,
            ...(answers[name] ?? { rows: [], error: 'no prices found' }),
          };
        }),
      },
    };
  });

  afterEach(() => applyAiData(null));

  it('asks the offscreen document for every permitted source', async () => {
    await updatePrices();

    expect(ensureOffscreenDocument).toHaveBeenCalled();
    const asked = chrome.runtime.sendMessage.mock.calls.map((c) => c[0]);
    expect(asked.map((m) => m.name)).toEqual(SOURCES.map((s) => s.name));
    expect(
      asked.every(
        (m) => m.target === 'offscreen' && m.msg === 'readPriceSource',
      ),
    ).toBe(true);
  });

  it('saves changed and new prices and the details, and puts them into use', async () => {
    const result = await updatePrices();

    expect(result).toMatchObject({ ok: true, changed: 1, added: 1 });
    expect(result.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const saved = store[AI_DATA_KEY];
    expect(saved.prices.find((p) => p[0] === 'gpt-5-mini')).toEqual([
      'gpt-5-mini',
      0.3,
      2.5,
    ]);
    expect(saved.prices.find((p) => p[0] === 'claude-opus-9')).toEqual([
      'claude-opus-9',
      1,
      5,
    ]);
    expect(saved.info['gpt-5-mini'].cachedInput).toBe(0.03);
    expect(saved.generated).toBe(result.generated);
    // in use right away
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.3,
      output: 2.5,
    });
    expect(getModelInfo('claude-opus-9').context).toBe(2_000_000);
  });

  it('removes nothing: a model no page lists keeps its price', async () => {
    await updatePrices();
    const names = store[AI_DATA_KEY].prices.map((p) => p[0]);
    expect(names).toContain('llama-3.3-70b');
  });

  it('does not take a price change of more than 10x, and says so', async () => {
    answers.openai = { rows: [row('gpt-5-mini', 30, 2, 'openai')] };

    const result = await updatePrices();

    expect(result.suspicious).toBe(1);
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.25,
      output: 2,
    });
  });

  it('leaves the models of a source that failed as they are, and names it', async () => {
    answers.openai = { rows: [], error: 'HTTP 403' };

    const result = await updatePrices();

    expect(result.ok).toBe(true);
    expect(result.failed).toContain('openai');
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.25,
      output: 2,
    });
  });

  it('reads only the sources it has the host permission for', async () => {
    chrome.permissions.contains.mockImplementation(
      async ({ origins }) =>
        origins[0].includes('openrouter.ai') ||
        origins[0].includes('developers.openai.com'),
    );

    const result = await updatePrices();

    expect(
      chrome.runtime.sendMessage.mock.calls.map((c) => c[0].name).sort(),
    ).toEqual(['openai', 'openrouter']);
    expect(result.skipped).toContain('anthropic');
    expect(result.skipped).not.toContain('openai');
  });

  it('says so when no source may be read yet, and changes nothing', async () => {
    chrome.permissions.contains.mockResolvedValue(false);
    const before = store[AI_DATA_KEY];

    const result = await updatePrices();

    expect(result).toMatchObject({ ok: false, reason: 'permission' });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(store[AI_DATA_KEY]).toBe(before);
  });

  it('is not ok when every permitted source fails', async () => {
    answers = {};
    const result = await updatePrices();
    expect(result.ok).toBe(false);
    expect(result.failed).toHaveLength(SOURCES.length);
    expect(store[AI_DATA_KEY].generated).toBe('2026-09-01');
  });

  it('an answer from a second update with nothing new still records the day', async () => {
    await updatePrices();
    store[AI_DATA_KEY].generated = '2020-01-01';

    const second = await updatePrices();

    expect(second).toMatchObject({ ok: true, changed: 0, added: 0 });
    expect(store[AI_DATA_KEY].generated).toBe(second.generated);
  });

  it('never throws, e.g. when the offscreen document cannot be created', async () => {
    ensureOffscreenDocument.mockRejectedValueOnce(new Error('no offscreen'));
    expect(await updatePrices()).toEqual({ ok: false, error: 'no offscreen' });
  });

  it('turns a failed message into a failed source', async () => {
    chrome.runtime.sendMessage.mockImplementation(async ({ name }) => {
      if (name === 'groq') throw new Error('port closed');
      const source = SOURCES.find((s) => s.name === name);
      return {
        name,
        url: source.url,
        official: source.official,
        rows: [],
        ...answers[name],
      };
    });

    const result = await updatePrices();

    expect(result.failed).toContain('groq');
  });

  it('the first update, with nothing saved yet, takes every price of the pages', async () => {
    delete store[AI_DATA_KEY];

    const result = await updatePrices();

    expect(result).toMatchObject({ ok: true, changed: 0, added: 2 });
    expect(store[AI_DATA_KEY].prices.map((p) => p[0]).sort()).toEqual([
      'claude-opus-9',
      'gpt-5-mini',
    ]);
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.3,
      output: 2.5,
    });
    // nothing else has a price: nothing is built in
    expect(getPrice('claude', 'claude-haiku-4-5')).toBeNull();
  });

  it("takes OpenRouter's models that the official pages do not list", async () => {
    delete store[AI_DATA_KEY];
    answers.openrouter = {
      rows: [row('gpt-4o', 2.5, 10, 'openrouter', { context: 128000 })],
    };

    await updatePrices();

    expect(getPrice('openai', 'gpt-4o')).toEqual({ input: 2.5, output: 10 });
    expect(getModelInfo('gpt-4o').context).toBe(128000);
  });
});
