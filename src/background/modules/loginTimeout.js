// @ts-check

// Injected into the login page via chrome.scripting.executeScript({ func }),
// so it is serialised: it must stay self-contained and not reference anything
// from this module or its imports.
function insertTimeOutMessage() {
  const loginForm = document.getElementById('login-form');
  const appTokenLogin = document.getElementById('app-token-login');
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
  document.addEventListener('click', (event) => {
    window.close();
  });
  loginForm.appendChild(button);

  loginForm.removeAttribute('action'); // reset default action
  loginForm.removeAttribute('method'); // reset default action
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
    console.log('!!!', e);
  }
}
