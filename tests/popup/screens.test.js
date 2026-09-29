/**
 * Unit tests for the popup screens (error box, authorize button, reconnect banner)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createAuthorizeButton,
  createErrorBox,
  createReconnectBanner,
  showRetryMessage,
} from '../../src/popup/modules/screens.js';

describe('screens.js', () => {
  let elements;
  let created;

  const makeElement = (tag) => {
    const element = {
      tagName: tag,
      id: '',
      className: '',
      textContent: '',
      disabled: false,
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      appendChild: vi.fn(),
      append: vi.fn(),
      remove: vi.fn(),
    };
    created.push(element);
    return element;
  };

  const clickHandler = (button) =>
    button.addEventListener.mock.calls.find(([type]) => type === 'click')[1];

  beforeEach(() => {
    created = [];
    elements = {
      bookmarkForm: {
        setAttribute: vi.fn(),
        replaceChildren: vi.fn(),
        appendChild: vi.fn(),
      },
    };
    globalThis.document = {
      createElement: vi.fn(makeElement),
      getElementById: vi.fn((id) => elements[id] ?? null),
      body: { replaceChildren: vi.fn() },
    };
    globalThis.window = { close: vi.fn() };
    globalThis.chrome = {
      i18n: { getMessage: vi.fn((key) => `[${key}]`) },
      runtime: { sendMessage: vi.fn() },
      permissions: { request: vi.fn().mockResolvedValue(true) },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createErrorBox', () => {
    const messageText = () =>
      created.find((element) => element.id === 'errormessage').textContent;

    it('shows the error text', () => {
      createErrorBox({ error: 'Something broke' });

      expect(messageText()).toBe('Something broke');
      expect(document.body.replaceChildren).toHaveBeenCalledTimes(1);
    });

    it('falls back to a generic text when there is no error message', () => {
      createErrorBox({});

      expect(messageText()).toBe('[ConnectionError]');
    });

    it('does not throw when called without data', () => {
      expect(() => createErrorBox()).not.toThrow();
      expect(messageText()).toBe('[ConnectionError]');
    });
  });

  describe('createAuthorizeButton', () => {
    it('sends the authorize message and closes the popup on click', () => {
      createAuthorizeButton();

      const button = elements.bookmarkForm.replaceChildren.mock.calls[0][0];
      clickHandler(button)();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msg: 'authorize',
      });
      expect(window.close).toHaveBeenCalled();
    });
  });

  describe('showRetryMessage', () => {
    it('appends the message to the form', () => {
      showRetryMessage(2, 5);

      const div = created.find((element) => element.id === 'retryMessage');
      expect(div.textContent).toBe('[retryingConnection] (2/5)');
      expect(elements.bookmarkForm.appendChild).toHaveBeenCalledWith(div);
    });

    it('replaces an earlier retry message', () => {
      const previous = { remove: vi.fn() };
      elements.retryMessage = previous;

      showRetryMessage(3, 5);

      expect(previous.remove).toHaveBeenCalled();
    });
  });

  describe('createReconnectBanner', () => {
    const setup = (server = 'https://cloud.example.com/path') => {
      const onGranted = vi.fn().mockResolvedValue(undefined);
      createReconnectBanner(server, onGranted);
      const [msg, button] = elements.bookmarkForm.replaceChildren.mock.calls[0];
      return { msg, button, onGranted, click: clickHandler(button) };
    };

    it('requests the server origin and runs onGranted when granted', async () => {
      const { onGranted, click } = setup();

      await click();

      expect(chrome.permissions.request).toHaveBeenCalledWith({
        origins: ['https://cloud.example.com/*'],
      });
      expect(onGranted).toHaveBeenCalledTimes(1);
    });

    it('shows the denied text and re-enables the button when refused', async () => {
      chrome.permissions.request.mockResolvedValue(false);
      const { msg, button, onGranted, click } = setup();

      await click();

      expect(onGranted).not.toHaveBeenCalled();
      expect(msg.textContent).toBe('[reconnectDenied]');
      expect(button.disabled).toBe(false);
    });

    it('disables the button while onGranted runs', async () => {
      let finish;
      const { button, onGranted, click } = setup();
      onGranted.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );

      const running = click();
      await Promise.resolve();
      await Promise.resolve();
      expect(button.disabled).toBe(true);

      finish();
      await running;
    });

    it('re-enables the button when onGranted fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { msg, button, onGranted, click } = setup();
      onGranted.mockRejectedValue(new Error('flow failed'));

      await click();

      expect(button.disabled).toBe(false);
      expect(msg.textContent).toBe('[reconnectDenied]');
    });

    it('shows the denied text for an unparsable server URL', async () => {
      const { msg, onGranted, click } = setup('not a url');

      await click();

      expect(chrome.permissions.request).not.toHaveBeenCalled();
      expect(onGranted).not.toHaveBeenCalled();
      expect(msg.textContent).toBe('[reconnectDenied]');
    });
  });
});
