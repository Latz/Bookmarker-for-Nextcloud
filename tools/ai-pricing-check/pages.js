// Downloads a provider's pricing page and turns it into plain text / table
// rows, which the extractors in src/lib/aiPriceExtractors.js search for model prices.
import { JSDOM, VirtualConsole } from 'jsdom';
import { cleanDocument } from '../../src/lib/aiPriceSources.js';

const USER_AGENT =
  'Mozilla/5.0 (compatible; bookmarker-pricing-check; +local dev tool)';
const TIMEOUT_MS = 30000;

/**
 * @param {string} url
 * @returns {Promise<{status: number, finalUrl: string, body: string, type: string}>}
 */
export async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/json;q=0.9,*/*;q=0.5',
      'accept-language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    status: response.status,
    finalUrl: response.url,
    type: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}

/**
 * Parses HTML with jsdom (no scripts run, no subresources load; errors of
 * the page's CSS are silenced) and removes everything that is not content.
 * @param {string} html
 * @returns {Document}
 */
export function parseHtml(html) {
  const virtualConsole = new VirtualConsole();
  const { window } = new JSDOM(html, { virtualConsole });
  return cleanDocument(window.document);
}
