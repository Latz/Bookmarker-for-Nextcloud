// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/storage.js', () => ({ getOptions: vi.fn() }));
vi.mock('../../src/lib/aiClient.js', () => ({ listModels: vi.fn() }));
vi.mock('../../src/background/modules/browser/notification.js', () => ({
  notifyCheaperModel: vi.fn(),
  notifyAutoSwitched: vi.fn(),
}));
vi.mock('../../src/background/modules/ai/priceUpdate.js', () => ({
  updatePrices: vi.fn(),
}));
vi.mock('../../src/lib/aiData.js', () => ({ loadAiData: vi.fn() }));
vi.mock('../../src/background/modules/ai/autoCheapest.js', () => ({
  applyAutoCheapest: vi.fn(),
  hostPattern: vi.fn((url) => {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  }),
}));

import { getOptions } from '../../src/lib/storage.js';
import { listModels } from '../../src/lib/aiClient.js';
import {
  notifyAutoSwitched,
  notifyCheaperModel,
} from '../../src/background/modules/browser/notification.js';
import { applyAutoCheapest } from '../../src/background/modules/ai/autoCheapest.js';
import { updatePrices } from '../../src/background/modules/ai/priceUpdate.js';
import { loadAiData } from '../../src/lib/aiData.js';
import {
  MODEL_CHECK_ALARM,
  checkCheaperModel,
  runModelCheckNow,
  runScheduledModelCheck,
  scheduleModelCheck,
} from '../../src/background/modules/ai/modelCheck.js';

const DAY = 24 * 60 * 60 * 1000;

describe('modelCheck', () => {
  let store;
  let options;

  beforeEach(() => {
    vi.clearAllMocks();
    updatePrices.mockResolvedValue({ ok: true, changed: 0, added: 0 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    store = {};
    options = {
      select_aiProvider: 'openai',
      cbx_aiModelCheck: true,
      input_networkTimeout: 10,
      input_openaiApiKey: 'key',
      input_openaiModel: 'gpt-5',
      input_openaiBaseUrl: 'https://api.openai.com/v1',
    };
    getOptions.mockImplementation(async (keys) =>
      Object.fromEntries(keys.map((key) => [key, options[key]])),
    );
    listModels.mockResolvedValue([
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'gpt-5-nano', label: 'gpt-5-nano' },
    ]);
    globalThis.chrome = {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: store[key] })),
          set: vi.fn(async (values) => Object.assign(store, values)),
        },
      },
      alarms: { get: vi.fn(), create: vi.fn() },
    };
  });

  describe('checkCheaperModel', () => {
    it('downloads the list and notifies about a cheaper model', async () => {
      const result = await checkCheaperModel();

      expect(listModels).toHaveBeenCalledWith(
        'openai',
        'key',
        'https://api.openai.com/v1',
        10,
      );
      expect(result.id).toBe('gpt-5-nano');
      expect(notifyCheaperModel).toHaveBeenCalledWith({
        provider: 'OpenAI',
        selected: 'gpt-5',
        suggested: 'gpt-5-nano',
        selectedPrice: { input: 1.25, output: 10 },
        suggestedPrice: { input: 0.05, output: 0.4 },
      });
    });

    it('tells about the same suggestion only once', async () => {
      await checkCheaperModel();
      await checkCheaperModel();
      expect(notifyCheaperModel).toHaveBeenCalledTimes(1);

      // another model is suggested later: that is news again
      listModels.mockResolvedValue([
        { id: 'gpt-5', label: 'gpt-5' },
        { id: 'gpt-5-mini', label: 'gpt-5-mini' },
      ]);
      await checkCheaperModel();
      expect(notifyCheaperModel).toHaveBeenCalledTimes(2);
    });

    it('is silent when the selected model is the cheapest', async () => {
      options.input_openaiModel = 'gpt-5-nano';
      expect(await checkCheaperModel()).toBeNull();
      expect(notifyCheaperModel).not.toHaveBeenCalled();
    });

    it.each([
      ['the AI is off', { select_aiProvider: 'off' }],
      ['the check is switched off', { cbx_aiModelCheck: false }],
      ['the key is missing', { input_openaiApiKey: '' }],
      ['no model is selected', { input_openaiModel: '' }],
    ])('does nothing when %s', async (_name, change) => {
      Object.assign(options, change);
      expect(await checkCheaperModel()).toBeNull();
      expect(listModels).not.toHaveBeenCalled();
    });

    it('does not ask a server it has no permission for', async () => {
      chrome.permissions.contains.mockResolvedValue(false);
      expect(await checkCheaperModel()).toBeNull();
      expect(chrome.permissions.contains).toHaveBeenCalledWith({
        origins: ['https://api.openai.com/*'],
      });
      expect(listModels).not.toHaveBeenCalled();
    });

    it('needs no key for a local server', async () => {
      Object.assign(options, {
        select_aiProvider: 'ollama',
        input_ollamaApiKey: '',
        input_ollamaModel: 'llama3',
        input_ollamaBaseUrl: 'http://localhost:11434/v1',
      });
      await checkCheaperModel();
      expect(chrome.permissions.contains).toHaveBeenCalledWith({
        origins: ['http://localhost/*'],
      });
      expect(listModels).toHaveBeenCalled();
    });

    it('never throws when the list cannot be loaded', async () => {
      listModels.mockRejectedValue(new Error('401'));
      expect(await checkCheaperModel()).toBeNull();
      expect(notifyCheaperModel).not.toHaveBeenCalled();
    });
  });

  describe('runScheduledModelCheck', () => {
    it('checks when there was no check yet or the last one is a week old', async () => {
      await runScheduledModelCheck();
      expect(listModels).toHaveBeenCalledTimes(1);

      store.aiModelCheck = { time: Date.now() - 7 * DAY };
      await runScheduledModelCheck();
      expect(listModels).toHaveBeenCalledTimes(2);
    });

    describe('with "switch automatically to the cheapest model" on', () => {
      const switched = {
        provider: 'openai',
        providerLabel: 'OpenAI',
        model: 'gpt-5-nano',
        from: 'gpt-5',
        price: { input: 0.05, output: 0.4 },
      };

      beforeEach(() => {
        options.cbx_aiAutoCheapest = true;
      });

      it('switches and tells the user, instead of only suggesting a model', async () => {
        applyAutoCheapest.mockResolvedValue(switched);

        await runScheduledModelCheck();

        expect(applyAutoCheapest).toHaveBeenCalledTimes(1);
        expect(notifyAutoSwitched).toHaveBeenCalledWith(switched);
        expect(notifyCheaperModel).not.toHaveBeenCalled();
        expect(listModels).not.toHaveBeenCalled();
      });

      it('stays silent when nothing was switched, and remembers the check', async () => {
        applyAutoCheapest.mockResolvedValue(null);

        await runScheduledModelCheck();
        await runScheduledModelCheck(); // a few days later is too soon

        expect(notifyAutoSwitched).not.toHaveBeenCalled();
        expect(applyAutoCheapest).toHaveBeenCalledTimes(1);
      });
    });

    it('skips an alarm that fires only a few days after the last check', async () => {
      store.aiModelCheck = { time: Date.now() - 2 * DAY };
      await runScheduledModelCheck();
      expect(listModels).not.toHaveBeenCalled();
    });
  });

  describe('scheduleModelCheck', () => {
    it('creates a weekly alarm if there is none', async () => {
      chrome.alarms.get.mockResolvedValue(undefined);
      await scheduleModelCheck();
      expect(chrome.alarms.create).toHaveBeenCalledWith(MODEL_CHECK_ALARM, {
        delayInMinutes: 5,
        periodInMinutes: 7 * 24 * 60,
      });
    });

    it('keeps an existing alarm', async () => {
      chrome.alarms.get.mockResolvedValue({ name: MODEL_CHECK_ALARM });
      await scheduleModelCheck();
      expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    it('does not throw without the alarms API', async () => {
      globalThis.chrome = {};
      await expect(scheduleModelCheck()).resolves.toBeUndefined();
    });
  });

  describe('runModelCheckNow', () => {
    it('says what came of the check', async () => {
      const result = await runModelCheckNow();
      expect(result.cheaper.id).toBe('gpt-5-nano');
      expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    it('ignores the "not too soon" rule and starts the weekly alarm over when done by hand', async () => {
      store.aiModelCheck = { time: Date.now() - 1000 };

      const result = await runModelCheckNow({ manual: true });

      expect(listModels).toHaveBeenCalledTimes(1);
      expect(result.cheaper.id).toBe('gpt-5-nano');
      expect(chrome.alarms.create).toHaveBeenCalledWith(MODEL_CHECK_ALARM, {
        delayInMinutes: 7 * 24 * 60,
        periodInMinutes: 7 * 24 * 60,
      });
    });

    it('with automatic switching on, says what was switched to', async () => {
      options.cbx_aiAutoCheapest = true;
      applyAutoCheapest.mockResolvedValue({
        model: 'gpt-5-nano',
        providerLabel: 'OpenAI',
      });

      const result = await runModelCheckNow({ manual: true });

      expect(result.switched.model).toBe('gpt-5-nano');
      expect(notifyAutoSwitched).toHaveBeenCalled();
    });
  });

  describe('prices and details are updated first', () => {
    it("reads the providers' pages before the check and reports the result", async () => {
      const order = [];
      updatePrices.mockImplementation(async () => {
        order.push('prices');
        return { ok: true, changed: 2, added: 1, generated: '2026-10-02' };
      });
      listModels.mockImplementation(async () => {
        order.push('check');
        return [{ id: 'gpt-5' }];
      });

      const result = await runModelCheckNow({ manual: true });

      expect(order).toEqual(['prices', 'check']);
      expect(result.prices).toEqual({
        ok: true,
        changed: 2,
        added: 1,
        generated: '2026-10-02',
      });
    });

    it('still checks with the saved or built-in prices when the update did not work', async () => {
      updatePrices.mockResolvedValue({ ok: false, reason: 'permission' });

      const result = await runModelCheckNow();

      expect(loadAiData).toHaveBeenCalled();
      expect(listModels).toHaveBeenCalled();
      expect(result.prices.reason).toBe('permission');
    });

    it('the weekly alarm updates the prices too', async () => {
      await runScheduledModelCheck();
      expect(updatePrices).toHaveBeenCalledTimes(1);
    });
  });
});
