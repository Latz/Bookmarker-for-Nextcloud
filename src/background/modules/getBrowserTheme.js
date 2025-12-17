// -------------------------------------------------------------------------------------------------------
// https://stackoverflow.com/questions/58880234/toggle-chrome-extension-icon-based-on-light-or-dark-mode-browser

// Request deduplication: prevent multiple simultaneous offscreen document creations
let inflightThemeRequest = null;

/**
 * Detects the browser's theme (light or dark) using the offscreen document API.
 * Implements request deduplication to prevent race conditions.
 * @returns {Promise<'light'|'dark'>} The detected theme, or 'light' as fallback on error
 */
export default async function getBrowserTheme() {
  // If there's already a request in flight, return that promise
  if (inflightThemeRequest) {
    return inflightThemeRequest;
  }

  // Create new request
  inflightThemeRequest = detectTheme();

  try {
    const result = await inflightThemeRequest;
    return result;
  } finally {
    // Clear inflight request after completion (success or failure)
    inflightThemeRequest = null;
  }
}

async function detectTheme() {
  const offscreenPath = '../offscreen/offscreen.html';

  try {
    // Check if offscreen document already exists
    // Note: There can only be one offscreen document
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    // Create only if it doesn't exist
    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL(offscreenPath),
        reasons: ['MATCH_MEDIA'],
        justification: 'matchmedia request',
      });
    }

    // Send message with timeout protection (5 seconds)
    const isLight = await Promise.race([
      chrome.runtime.sendMessage({
        target: 'offscreen',
        msg: 'getBrowserTheme',
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Theme detection timeout')), 5000)
      ),
    ]);

    // Close document (only if we created it)
    if (existingContexts.length === 0) {
      await chrome.offscreen.closeDocument();
    }

    return isLight ? 'light' : 'dark';
  } catch (error) {
    console.error('Failed to detect browser theme:', error);
    // Fallback to light theme on error
    return 'light';
  }
}
