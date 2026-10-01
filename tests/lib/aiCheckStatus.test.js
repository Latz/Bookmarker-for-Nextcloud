// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MODEL_CHECK_ALARM,
  MODEL_CHECK_STATE_KEY,
  getCheckStatus,
} from '../../src/lib/aiCheckStatus.js';

describe('getCheckStatus', () => {
  beforeEach(() => {
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [MODEL_CHECK_STATE_KEY]: { time: 1_700_000_000_000 },
            aiData: { generated: '2026-10-02' },
          }),
        },
      },
      alarms: {
        get: vi.fn().mockResolvedValue({ scheduledTime: 1_700_600_000_000 }),
      },
    };
  });

  it('gives the time of the last check and of the next alarm', async () => {
    expect(await getCheckStatus()).toEqual({
      last: 1_700_000_000_000,
      next: 1_700_600_000_000,
      prices: '2026-10-02',
    });
    expect(chrome.alarms.get).toHaveBeenCalledWith(MODEL_CHECK_ALARM);
  });

  it('has null for what is not known (never ran, no alarm)', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.alarms.get.mockResolvedValue(undefined);
    expect(await getCheckStatus()).toEqual({
      last: null,
      next: null,
      prices: null,
    });
  });

  it('never throws, also without the APIs', async () => {
    globalThis.chrome = {};
    expect(await getCheckStatus()).toEqual({
      last: null,
      next: null,
      prices: null,
    });
  });
});
