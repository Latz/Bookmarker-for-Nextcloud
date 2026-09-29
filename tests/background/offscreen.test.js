// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('offscreen document message handler', () => {
  let listener;

  beforeEach(async () => {
    vi.resetModules();
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((fn) => {
            listener = fn;
          }),
        },
      },
    };
    globalThis.window = { matchMedia: vi.fn() };
    await import('../../src/background/modules/browser/offscreen/offscreen.js');
  });

  it('registers exactly one message listener', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ msg: 'ready' }],
    [{ target: 'background', msg: 'ready' }],
    [{ msg: 'getBrowserTheme' }],
  ])('ignores messages not addressed to it: %j', (request) => {
    const sendResponse = vi.fn();

    expect(listener(request, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('answers the readiness check at once', () => {
    const sendResponse = vi.fn();

    const keepOpen = listener(
      { target: 'offscreen', msg: 'ready' },
      {},
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith(true);
    expect(keepOpen).toBe(false);
  });

  it.each([true, false])('reports prefers-color-scheme light = %s', (matches) => {
    window.matchMedia.mockReturnValue({ matches });
    const sendResponse = vi.fn();

    listener({ target: 'offscreen', msg: 'getBrowserTheme' }, {}, sendResponse);

    expect(window.matchMedia).toHaveBeenCalledWith(
      '(prefers-color-scheme: light)',
    );
    expect(sendResponse).toHaveBeenCalledWith(matches);
  });

  it('falls back to light when matchMedia throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.matchMedia.mockImplementation(() => {
      throw new Error('unsupported');
    });
    const sendResponse = vi.fn();

    listener({ target: 'offscreen', msg: 'getBrowserTheme' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(true);
    error.mockRestore();
  });

  it('ignores unknown messages addressed to it', () => {
    const sendResponse = vi.fn();

    expect(
      listener({ target: 'offscreen', msg: 'other' }, {}, sendResponse),
    ).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
