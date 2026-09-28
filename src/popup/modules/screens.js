// @ts-check

/**
 * Shows a retry message in the popup
 * @param {number} currentRetry - The current retry number (1-indexed)
 * @param {number} maxRetries - The maximum number of retries
 */
export function showRetryMessage(currentRetry, maxRetries) {
  const baseMessage = chrome.i18n.getMessage('retryingConnection');
  const message = `${baseMessage} (${currentRetry}/${maxRetries})`;
  const retryDiv = document.createElement('div');
  retryDiv.id = 'retryMessage';
  retryDiv.className = 'text-center text-sm text-yellow-600 mt-2';
  retryDiv.textContent = message;

  // Remove any existing retry message
  const existingMessage = document.getElementById('retryMessage');
  if (existingMessage) {
    existingMessage.remove();
  }

  // Add the retry message to the form
  const form = document.getElementById('bookmarkForm');
  if (form) {
    form.appendChild(retryDiv);
  }
}
// --------------------------------------------------------------------------------------------------
/**
 * Replaces the popup body with an error box.
 * @param {{error?: string}} [data] - The failed result; its `error` is shown.
 */
export function createErrorBox(data) {
  const parent = document.createElement('div');
  parent.className =
    'parent w-full justify-items-center items-center border border-sky-500';

  const iconDiv = document.createElement('div');
  iconDiv.className = 'div1';
  const img = document.createElement('img');
  img.src = '../images/icon-64x64-light.png';
  img.height = 64;
  img.width = 64;
  img.alt = '';
  iconDiv.appendChild(img);

  const labelDiv = document.createElement('div');
  labelDiv.className =
    'div2 text-left text-3xl font-bold text-sky-500 underline';
  labelDiv.textContent = `${chrome.i18n.getMessage('error')}:`;

  const msgDiv = document.createElement('div');
  msgDiv.id = 'errormessage';
  msgDiv.className = 'div3 text-clip';
  msgDiv.textContent =
    data?.error || chrome.i18n.getMessage('ConnectionError') || 'Error';

  parent.append(iconDiv, labelDiv, msgDiv);
  document.body.replaceChildren(parent);
}
// --------------------------------------------------------------------------------------------------
export function createAuthorizeButton() {
  const form = document.getElementById('bookmarkForm');
  form.setAttribute('class', 'flex justify-center w-full');
  const button = document.createElement('button');
  button.setAttribute('id', 'authorize');
  button.setAttribute(
    'aria-label',
    chrome.i18n.getMessage('authorizeExtension'),
  );

  button.textContent = chrome.i18n.getMessage('authorizeExtension');
  button.setAttribute('class', 'btn btn-primary w-full');
  form.replaceChildren(button);
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ msg: 'authorize' });
    window.close();
  });
}

/**
 * Renders a "reconnect" prompt in place of the normal form when the stored
 * Nextcloud server's optional host permission is missing (S5 migration:
 * existing installs lose their previously-granted host_permissions on
 * update, and nothing re-grants that automatically).
 *
 * @param {string|undefined} server - The stored server URL, for display and for deriving the origin to request.
 * @param {() => Promise<void>} onGranted - Runs the normal form flow once the permission is granted. Passed in so this module does not depend on the boot code.
 * @returns {void}
 */
export function createReconnectBanner(server, onGranted) {
  const form = document.getElementById('bookmarkForm');
  form.setAttribute(
    'class',
    'flex flex-col justify-center items-center w-full gap-2',
  );

  const msg = document.createElement('div');
  msg.textContent = `${chrome.i18n.getMessage('reconnectRequired')} ${server ?? ''}`;
  msg.className = 'text-center text-sm';

  const button = document.createElement('button');
  button.setAttribute('id', 'reconnect');
  button.textContent = chrome.i18n.getMessage('reconnectButton');
  button.setAttribute('class', 'btn btn-primary w-full');

  button.addEventListener('click', async () => {
    let origin;
    try {
      origin = new URL(server).origin;
    } catch (e) {
      msg.textContent = chrome.i18n.getMessage('reconnectDenied');
      return;
    }

    // A second click while the request/form flow runs would build the form twice
    button.disabled = true;
    try {
      const granted = await chrome.permissions.request({
        origins: [`${origin}/*`],
      });
      if (!granted) {
        msg.textContent = chrome.i18n.getMessage('reconnectDenied');
        button.disabled = false;
        return;
      }

      await onGranted();
    } catch (error) {
      console.error('[popup] reconnect failed:', error);
      msg.textContent = chrome.i18n.getMessage('reconnectDenied');
      button.disabled = false;
    }
  });

  form.replaceChildren(msg, button);
}
