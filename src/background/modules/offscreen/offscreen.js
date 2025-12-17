chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate message is intended for offscreen document
  if (request.target !== 'offscreen' || request.msg !== 'getBrowserTheme') {
    return false; // Not for us, don't handle
  }

  try {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const matches = media.matches;
    sendResponse(matches);
  } catch (error) {
    console.error('Error in offscreen matchMedia:', error);
    // Default to light theme on error
    sendResponse(true);
  }

  return true; // Keep channel open for async response
});
