/**
 * Unit tests for the getData request/retry logic used by the popup
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/lib/storage.js', () => ({
  getOption: vi.fn(),
}));

vi.mock('../../src/popup/modules/screens.js', () => ({
  showRetryMessage: vi.fn(),
}));

import { getOption } from '../../src/lib/storage.js';
import { showRetryMessage } from '../../src/popup/modules/screens.js';
import { getDataWithRetry } from '../../src/popup/modules/dataRequest.js';

describe('dataRequest.js', () => {
  let sendMessage;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sendMessage = vi.fn();
    globalThis.chrome = {
      runtime: { sendMessage },
      i18n: { getMessage: vi.fn(() => '') },
    };
    getOption.mockResolvedValue(false); // retry count falls back to 5
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const run = async () => {
    const result = getDataWithRetry();
    await vi.runAllTimersAsync();
    return result;
  };

  it('returns the first successful reply without retrying', async () => {
    sendMessage.mockResolvedValue({ ok: true, url: 'https://example.com' });

    const data = await run();

    expect(data).toEqual({ ok: true, url: 'https://example.com' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ msg: 'getData' });
  });

  it('dispatches the first request before the retry count is read', () => {
    getOption.mockReturnValue(new Promise(() => {})); // never resolves
    sendMessage.mockResolvedValue({ ok: true });

    getDataWithRetry();

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not retry a terminal error', async () => {
    sendMessage.mockResolvedValue({
      ok: false,
      error: 'not bookmarkable',
      retryable: false,
    });

    const data = await run();

    expect(data.error).toBe('not bookmarkable');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('retries when sendMessage throws and recovers', async () => {
    sendMessage
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValue({ ok: true });

    const data = await run();

    expect(data).toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('returns a retryable error with the thrown message after all attempts', async () => {
    sendMessage.mockRejectedValue(new Error('Message error'));

    const data = await run();

    expect(sendMessage).toHaveBeenCalledTimes(5);
    expect(data).toEqual({
      ok: false,
      retryable: true,
      error: 'Message error',
    });
  });

  it('treats an empty reply as a failed attempt', async () => {
    sendMessage.mockResolvedValue(undefined);

    const data = await run();

    expect(sendMessage).toHaveBeenCalledTimes(5);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Error');
  });

  it('uses the configured number of retries', async () => {
    getOption.mockResolvedValue(3);
    sendMessage.mockResolvedValue({ ok: false, error: 'nope' });

    await run();

    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it('falls back to 5 attempts when the retry count cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getOption.mockRejectedValue(new Error('idb down'));
    sendMessage.mockResolvedValue({ ok: false, error: 'nope' });

    await run();

    expect(sendMessage).toHaveBeenCalledTimes(5);
  });

  it('shows the retry message from the second retry on', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'nope' });

    await run();

    expect(showRetryMessage.mock.calls).toEqual([
      [2, 5],
      [3, 5],
      [4, 5],
    ]);
  });
});
