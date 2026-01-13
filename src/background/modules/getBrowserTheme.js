// -------------------------------------------------------------------------------------------------------
// https://stackoverflow.com/questions/58880234/toggle-chrome-extension-icon-based-on-light-or-dark-mode-browser

// Request deduplication: prevent multiple simultaneous offscreen document creations
let inflightThemeRequest = null;
let offscreenDocumentPromise = null;

/**
 * Gets or creates the offscreen document for various operations
 * @returns {Promise<void>}
 */
async function ensureOffscreenDocument() {
  // If we already have a promise for creating the document, return it
  if (offscreenDocumentPromise) {
    return offscreenDocumentPromise;
  }

  offscreenDocumentPromise = (async () => {
    const offscreenPath = 'src/background/modules/offscreen/offscreen.html';

    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    // Create only if it doesn't exist
    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL(offscreenPath),
        reasons: ['MATCH_MEDIA', 'DOM_PARSER'],
        justification: 'matchmedia request and HTML parsing',
      });
    }
  })();

  try {
    await offscreenDocumentPromise;
  } finally {
    offscreenDocumentPromise = null;
  }
}

/**
 * Closes the offscreen document if it was created by this session
 * @param {boolean} wasCreated - Whether this session created the document
 */
async function closeOffscreenDocument(wasCreated) {
  if (wasCreated) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (error) {
      // Ignore errors when closing offscreen document (it may already be closed)
      console.debug('Error closing offscreen document:', error.message);
    }
  }
}

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
  let wasCreated = false;

  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    wasCreated = existingContexts.length === 0;
    await ensureOffscreenDocument();

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

    await closeOffscreenDocument(wasCreated);

    // Validate response - default to light on unexpected results
    if (typeof isLight !== 'boolean') {
      console.warn('Unexpected theme response:', isLight);
      return 'light';
    }
    return isLight ? 'light' : 'dark';
  } catch (error) {
    console.error('Failed to detect browser theme:', error);
    // Try to clean up on error
    try {
      await closeOffscreenDocument(wasCreated);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    // Fallback to light theme on error
    return 'light';
  }
}

/**
 * Parses HTML content using the offscreen document's DOMParser
 * @param {string} htmlContent - The HTML content to parse
 * @returns {Promise<Object>} Parsed document data for getKeywords and getDescription
 */
export async function parseHTMLWithOffscreen(htmlContent) {
  let wasCreated = false;

  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    wasCreated = existingContexts.length === 0;
    await ensureOffscreenDocument();

    // Send message with timeout protection (10 seconds for parsing)
    const result = await Promise.race([
      chrome.runtime.sendMessage({
        target: 'offscreen',
        msg: 'parseHTML',
        html: htmlContent,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('HTML parsing timeout')), 10000)
      ),
    ]);

    await closeOffscreenDocument(wasCreated);

    // Validate result structure
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response from offscreen document');
    }

    if (result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (error) {
    console.error('Failed to parse HTML with offscreen:', error);
    // Try to clean up on error
    try {
      await closeOffscreenDocument(wasCreated);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}
