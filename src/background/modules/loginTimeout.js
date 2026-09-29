// @ts-check

// Injected into the login page via chrome.scripting.executeScript({ func }),
// so it is serialised: it must stay self-contained and not reference anything
// from this module or its imports.
/**
 * Replaces the login form with a "Timeout" message and a close button.
 * Runs inside the login page, not in the service worker.
 * @returns {void}
 */
function insertTimeOutMessage() {
  const loginForm = document.getElementById('login-form');
  const appTokenLogin = document.getElementById('app-token-login');
  // Empty the form, then build the message and a close button from scratch
  // (DOM API instead of innerHTML, so no markup is parsed).
  loginForm.replaceChildren();
  const msg = document.createElement('div');
  msg.setAttribute(
    'style',
    'text-size: 1.2em; font-weight: 600; margin-bottom: 30px;',
  );
  msg.innerText =
    'Timeout. Please close this tab and authorize the  extension again.';
  loginForm.appendChild(msg);
  const button = document.createElement('button');
  button.setAttribute('class', 'login primary');
  button.setAttribute('style', 'padding: 0 30px 0 30px');
  button.innerText = 'Close';
  // Listener on the whole document: any click closes the tab, not only one
  // on the button.
  document.addEventListener('click', (event) => {
    window.close();
  });
  loginForm.appendChild(button);

  // Without these the button would submit the (now meaningless) login form.
  loginForm.removeAttribute('action'); // reset default action
  loginForm.removeAttribute('method'); // reset default action
  // Remove the app-token fallback section as well; it is useless after a timeout.
  appTokenLogin.replaceChildren();
}

/**
 * Replaces the login form of the given tab with a timeout message.
 * @param {{id: number}} loginPage - The login tab.
 * @returns {Promise<void>}
 */
export async function maxAttemptsError(loginPage) {
  const tabId = loginPage.id;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: insertTimeOutMessage,
    });
  } catch (e) {
    // The login tab may have been closed by the user in the meantime, in
    // which case injecting fails; there is nothing left to update.
    console.log('!!!', e);
  }
}
