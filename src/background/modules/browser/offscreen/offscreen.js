// @ts-check
// -----------------------------------------------------------------------------
// Offscreen document script.
//
// A service worker has no `window`, so it cannot call `matchMedia` to find out
// whether the browser is in light or dark mode. The extension therefore opens
// this hidden offscreen document, which does have a DOM, and asks it via
// messages (see getBrowserTheme.js for the caller).
//
// Every message carries `target: 'offscreen'` so this listener ignores the
// messages that are meant for the service worker.
// -----------------------------------------------------------------------------
import {
  SOURCES,
  cleanDocument,
  readSource,
} from '../../../../lib/aiPriceSources.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate message is intended for offscreen document
  if (request.target !== 'offscreen') {
    return false; // Not for us, don't handle
  }

  // Handle readiness check (instant response, no processing needed).
  // The service worker polls this after creating the document, because the
  // document exists before its script has registered this listener.
  if (request.msg === 'ready') {
    sendResponse(true);
    return false;
  }

  // Handle theme detection
  if (request.msg === 'getBrowserTheme') {
    try {
      // `true` means the browser prefers a light color scheme.
      const media = window.matchMedia('(prefers-color-scheme: light)');
      const matches = media.matches;
      sendResponse(matches);
    } catch (error) {
      console.error('Error in offscreen matchMedia:', error);
      // Default to light theme on error
      sendResponse(true);
    }
    return true; // Keep channel open for async response
  }

  // Reading a provider's price page: this document has a DOM, the service
  // worker has not. It fetches the page itself (extension pages may fetch
  // servers they have the host permission for) and answers only with the
  // small result, not the page.
  if (request.msg === 'readPriceSource') {
    const source = SOURCES.find((candidate) => candidate.name === request.name);
    if (!source) {
      sendResponse({
        name: request.name,
        rows: [],
        error: 'unknown source',
      });
      return false;
    }
    readSource(source, {
      fetchText: async (url) => {
        const response = await fetch(url, {
          headers: { 'accept-language': 'en-US,en;q=0.9' },
          signal: AbortSignal.timeout(30000),
        });
        return { status: response.status, body: await response.text() };
      },
      parseHtml: (html) =>
        cleanDocument(new DOMParser().parseFromString(html, 'text/html')),
    }).then(sendResponse);
    return true; // Keep channel open for async response
  }

  return false; // Not handled
});
