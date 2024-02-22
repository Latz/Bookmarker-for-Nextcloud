// -------------------------------------------------------------------------------------------------------
// https://stackoverflow.com/questions/58880234/toggle-chrome-extension-icon-based-on-light-or-dark-mode-browser

export default async function getBrowserTheme() {
  const offscreenPath = '../offscreen/offscreen.html';
  // There can ony be one offscreen document
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(offscreenPath),
    reasons: ['MATCH_MEDIA'],
    justification: 'matchmedia request',
  });
  const isLight = await chrome.runtime.sendMessage({
    target: 'offscreen',
    msg: 'getBrowserTheme',
  });
  chrome.offscreen.closeDocument();

  return isLight ? 'light' : 'dark';
}
