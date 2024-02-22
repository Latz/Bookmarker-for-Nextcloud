chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const matches = media.matches;
  sendResponse(matches);
  return true;
});
