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

  it.each([true, false])(
    'reports prefers-color-scheme light = %s',
    (matches) => {
      window.matchMedia.mockReturnValue({ matches });
      const sendResponse = vi.fn();

      listener(
        { target: 'offscreen', msg: 'getBrowserTheme' },
        {},
        sendResponse,
      );

      expect(window.matchMedia).toHaveBeenCalledWith(
        '(prefers-color-scheme: light)',
      );
      expect(sendResponse).toHaveBeenCalledWith(matches);
    },
  );

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

  describe('readPriceSource', () => {
    const ask = (name) =>
      new Promise((resolve) => {
        const keep = listener(
          { target: 'offscreen', msg: 'readPriceSource', name },
          {},
          resolve,
        );
        expect(keep).toBe(true); // the answer comes later
      });

    it('fetches the page of the source, parses it and answers with the rows only', async () => {
      globalThis.DOMParser = class {
        parseFromString(html) {
          // a stand-in for the browser's parser: the tables of the page
          const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => m[1]);
          return {
            body: { textContent: '' },
            querySelectorAll: (selector) =>
              selector === 'table'
                ? [
                    {
                      querySelectorAll: () =>
                        rows.map((row) => ({
                          querySelectorAll: () =>
                            [...row.matchAll(/<t[dh]>(.*?)<\/t[dh]>/g)].map(
                              (m) => ({
                                textContent: m[1],
                              }),
                            ),
                        })),
                    },
                  ]
                : [],
          };
        }
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          '<table><tr><th>Model</th><th>Input</th><th>Cached input</th><th>Output</th></tr>' +
          '<tr><td>Mistral Large 3</td><td>$0.5</td><td>$0.05</td><td>$1.5</td></tr></table>',
      });

      const answer = await ask('mistral');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://docs.mistral.ai/inference/pricing',
        expect.objectContaining({
          headers: { 'accept-language': 'en-US,en;q=0.9' },
        }),
      );
      expect(answer.name).toBe('mistral');
      expect(answer.rows[0]).toMatchObject({
        prefix: 'mistral-large',
        input: 0.5,
        output: 1.5,
      });
      expect(answer.error).toBeUndefined();
    });

    it('answers with an error for an unknown source, without fetching', () => {
      globalThis.fetch = vi.fn();
      const answers = [];
      const keep = listener(
        { target: 'offscreen', msg: 'readPriceSource', name: 'nope' },
        {},
        (value) => answers.push(value),
      );
      expect(keep).toBe(false);
      expect(answers[0]).toMatchObject({
        name: 'nope',
        rows: [],
        error: 'unknown source',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('answers with the error when the page cannot be fetched', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
      const answer = await ask('mistral');
      expect(answer.error).toBe('offline');
      expect(answer.rows).toEqual([]);
    });
  });
});
