// Downloads a provider's pricing page and turns it into plain text / table
// rows, which the extractors in extractors.js search for model prices.
import { JSDOM, VirtualConsole } from 'jsdom';

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
  window.document
    .querySelectorAll('script, style, noscript, template')
    .forEach((node) => node.remove());
  return window.document;
}

/**
 * The visible text of a document with whitespace collapsed.
 * @param {Document} document
 * @returns {string}
 */
export function documentText(document) {
  return (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Every table of a document as rows of cell texts.
 * @param {Document} document
 * @returns {string[][][]} tables -> rows -> cells
 */
export function documentTables(document) {
  return Array.from(document.querySelectorAll('table')).map((table) =>
    Array.from(table.querySelectorAll('tr')).map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) =>
        cell.textContent.replace(/\s+/g, ' ').trim(),
      ),
    ),
  );
}
