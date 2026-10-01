// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AI_DATA_KEY,
  applyAiData,
  loadAiData,
  readSavedAiData,
  saveAiData,
  validateAiData,
} from '../../src/lib/aiData.js';
import {
  cheapestModels,
  getPrice,
  getPricesList,
  setPrices,
} from '../../src/lib/aiPricing.js';
import { getModelInfo, setModelInfo } from '../../src/lib/aiModelInfo.js';

const good = () => ({
  prices: [
    ['gpt-5-mini', 0.3, 2.5],
    ['brand-new-model', 0.01, 0.02],
  ],
  info: { 'gpt-5-mini': { context: 123456, description: 'Saved.' } },
  generated: '2026-10-02',
});

describe('validateAiData', () => {
  it('accepts valid data and keeps only known fields', () => {
    const result = validateAiData({
      ...good(),
      info: { x: { context: 5, junk: 'ignored', description: 'ok' } },
    });
    expect(result.ok).toBe(true);
    expect(result.data.prices).toEqual(good().prices);
    expect(result.data.info.x).toEqual({ context: 5, description: 'ok' });
    expect(result.data.generated).toBe('2026-10-02');
  });

  it.each([
    ['nothing', undefined],
    ['no prices', { info: {} }],
    ['a price that is not a list', { prices: ['gpt-5', 1, 2] }],
    ['a price without a name', { prices: [['', 1, 2]] }],
    ['a zero price', { prices: [['a', 0, 2]] }],
    ['a negative price', { prices: [['a', 1, -2]] }],
    ['a price that is no number', { prices: [['a', '1', 2]] }],
    ['bad details', { prices: [['a', 1, 2]], info: { a: 'text' } }],
    [
      'a bad context',
      { prices: [['a', 1, 2]], info: { a: { context: 'big' } } },
    ],
    [
      'a bad description',
      { prices: [['a', 1, 2]], info: { a: { description: 5 } } },
    ],
  ])('rejects %s', (_name, data) => {
    expect(validateAiData(data).ok).toBe(false);
  });

  it('rejects far too many models', () => {
    const prices = Array.from({ length: 2001 }, (_, i) => [`m${i}`, 1, 1]);
    expect(validateAiData({ prices, info: {} }).ok).toBe(false);
  });

  it('cuts overlong texts', () => {
    const result = validateAiData({
      prices: [['a', 1, 2]],
      info: { a: { description: 'x'.repeat(5000) } },
    });
    expect(result.data.info.a.description).toHaveLength(600);
  });
});

describe('using the data', () => {
  afterEach(() => {
    applyAiData(null);
    vi.restoreAllMocks();
  });

  it('applyAiData changes what getPrice, cheapestModels and getModelInfo say', () => {
    const before = getPrice('openai', 'gpt-5-mini');
    expect(before).toEqual({ input: 0.25, output: 2 });

    applyAiData(validateAiData(good()).data);

    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.3,
      output: 2.5,
    });
    expect(getModelInfo('gpt-5-mini').context).toBe(123456);
    // a new, very cheap model leads the ranking (it has a provider only if
    // the name is known, so use a known family)
    applyAiData({
      prices: [['gpt-5-nano', 0.0001, 0.0001]],
      info: {},
      generated: '',
    });
    expect(cheapestModels(1)[0].model).toBe('gpt-5-nano');
  });

  it('applyAiData(null) leaves no prices and no details: nothing is built in', () => {
    applyAiData(validateAiData(good()).data);
    applyAiData(null);
    expect(getPrice('openai', 'gpt-5-mini')).toBeNull();
    expect(getModelInfo('gpt-5-mini')).toBeNull();
    expect(cheapestModels(10)).toEqual([]);
  });

  it('saved data replaces the prices in use as a whole', () => {
    applyAiData(validateAiData(good()).data);
    // a model the saved data does not list has no price
    expect(getPrice('claude', 'claude-haiku-4-5')).toBeNull();
    expect(getPrice('openai', 'brand-new-model')).toEqual({
      input: 0.01,
      output: 0.02,
    });
  });

  it('setPrices(null) and an empty list leave no prices', () => {
    setPrices([['x', 1, 1]]);
    expect(getPricesList()).toHaveLength(1);
    setPrices([]);
    expect(getPricesList()).toEqual([]);
    setPrices([['x', 1, 1]]);
    setPrices(null);
    expect(getPricesList()).toEqual([]);
    setModelInfo(null);
  });
});

describe('storage', () => {
  let store;
  let listeners;

  beforeEach(() => {
    store = {};
    listeners = [];
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: store[key] })),
          set: vi.fn(async (values) => Object.assign(store, values)),
        },
        onChanged: { addListener: vi.fn((fn) => listeners.push(fn)) },
      },
    };
  });

  afterEach(() => applyAiData(null));

  it('saveAiData stores the data with a time and puts it into use', async () => {
    await saveAiData(good());

    expect(store[AI_DATA_KEY].prices).toEqual(good().prices);
    expect(store[AI_DATA_KEY].fetched).toBeGreaterThan(0);
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.3,
      output: 2.5,
    });
  });

  it('saveAiData refuses invalid data and changes nothing', async () => {
    await expect(saveAiData({ prices: [['a', -1, 1]] })).rejects.toThrow();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.25,
      output: 2,
    });
  });

  it('readSavedAiData gives null for nothing and for corrupt data', async () => {
    expect(await readSavedAiData()).toBeNull();
    store[AI_DATA_KEY] = { prices: 'nope' };
    expect(await readSavedAiData()).toBeNull();
    globalThis.chrome = {};
    expect(await readSavedAiData()).toBeNull();
  });

  it('loadAiData puts the saved data into use and follows later changes', async () => {
    store[AI_DATA_KEY] = good();

    await loadAiData();
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({
      input: 0.3,
      output: 2.5,
    });

    // another context saves new data
    listeners.at(-1)(
      {
        [AI_DATA_KEY]: {
          newValue: { prices: [['gpt-5-mini', 9, 9]], info: {} },
        },
      },
      'local',
    );
    expect(getPrice('openai', 'gpt-5-mini')).toEqual({ input: 9, output: 9 });

    // the data is removed: no prices
    listeners.at(-1)({ [AI_DATA_KEY]: {} }, 'local');
    expect(getPrice('openai', 'gpt-5-mini')).toBeNull();

    // other storage areas and keys are ignored
    listeners.at(-1)({ [AI_DATA_KEY]: { newValue: good() } }, 'sync');
    listeners.at(-1)({ other: {} }, 'local');
    expect(getPrice('openai', 'gpt-5-mini')).toBeNull();
  });
});
