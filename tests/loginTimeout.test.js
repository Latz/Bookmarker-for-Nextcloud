// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { maxAttemptsError } from '../src/background/modules/loginTimeout.js';

describe('maxAttemptsError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.chrome = { scripting: { executeScript: vi.fn() } };
  });

  it('injects the timeout message into the login tab', async () => {
    chrome.scripting.executeScript.mockResolvedValue([]);

    await maxAttemptsError({ id: 42 });

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      func: expect.any(Function),
    });
  });

  it('does not throw when the tab cannot be scripted (closed, or no access)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    chrome.scripting.executeScript.mockRejectedValue(
      new Error('No tab with id: 42'),
    );

    await expect(maxAttemptsError({ id: 42 })).resolves.toBeUndefined();
    log.mockRestore();
  });

  describe('the injected function', () => {
    // It is serialised into the login page, so it is run here against a DOM
    // shaped like Nextcloud's login page.
    async function injected() {
      chrome.scripting.executeScript.mockResolvedValue([]);
      await maxAttemptsError({ id: 1 });
      return chrome.scripting.executeScript.mock.calls[0][0].func;
    }

    beforeEach(() => {
      document.body.innerHTML = `
        <form id="login-form" action="/login" method="post"><input name="user"></form>
        <div id="app-token-login"><a>use token</a></div>`;
    });

    it('replaces the login form with the message and a close button', async () => {
      const func = await injected();

      func();

      const form = document.getElementById('login-form');
      expect(form.querySelector('input')).toBeNull();
      expect(form.textContent).toContain('Timeout');
      expect(form.querySelector('button').textContent).toBe('Close');
    });

    it('removes the form submission and the app token link', async () => {
      const func = await injected();

      func();

      const form = document.getElementById('login-form');
      expect(form.hasAttribute('action')).toBe(false);
      expect(form.hasAttribute('method')).toBe(false);
      expect(document.getElementById('app-token-login').children).toHaveLength(0);
    });

    it('closes the window on click', async () => {
      const func = await injected();
      const close = vi.spyOn(window, 'close').mockImplementation(() => {});

      func();
      document.body.click();

      expect(close).toHaveBeenCalled();
    });
  });
});
