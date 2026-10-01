// @ts-check
// The pages the prices are read from, and the reading of one of them. Shared by
// the pricing checker (tools/ai-pricing-check, Node + jsdom) and by the
// extension (the offscreen document, where there is a DOMParser): both pass
// in how to fetch a page and how to parse HTML.
import {
  extractAnthropic,
  extractDeepSeek,
  extractGoogle,
  extractGroq,
  extractMistral,
  extractOpenAI,
  extractOpenRouter,
} from './aiPriceExtractors.js';

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

/**
 * Removes everything from a parsed page that is not content.
 * @param {Document} document
 * @returns {Document} The same document.
 */
export function cleanDocument(document) {
  document
    .querySelectorAll('script, style, noscript, template')
    .forEach((node) => node.remove());
  return document;
}

/**
 * @typedef {object} PriceSource
 * @property {string} name
 * @property {string} url
 * @property {boolean} official - Official prices (else a cross-check/fallback).
 * @property {boolean} [json] - The URL answers JSON, not HTML.
 * @property {(parsed: any) => Array<any>} extract
 */

/** @type {PriceSource[]} */
export const SOURCES = [
  {
    name: 'anthropic',
    url: 'https://platform.claude.com/docs/en/about-claude/pricing',
    official: true,
    extract: ({ tables }) => extractAnthropic(tables),
  },
  {
    name: 'openai',
    url: 'https://developers.openai.com/api/docs/pricing',
    official: true,
    extract: ({ tables }) => extractOpenAI(tables),
  },
  {
    name: 'google',
    url: 'https://ai.google.dev/gemini-api/docs/pricing?hl=en',
    official: true,
    extract: ({ document }) => extractGoogle(document),
  },
  {
    name: 'deepseek',
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
    official: true,
    extract: ({ document, tables }) =>
      extractDeepSeek(tables, documentText(document)),
  },
  {
    name: 'groq',
    url: 'https://console.groq.com/docs/models',
    official: true,
    extract: ({ document }) => extractGroq(document),
  },
  {
    name: 'mistral',
    url: 'https://docs.mistral.ai/inference/pricing',
    official: true,
    extract: ({ tables }) => extractMistral(tables),
  },
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/models',
    official: false,
    json: true,
    extract: ({ json }) => extractOpenRouter(json),
  },
];

/**
 * Downloads one source and extracts its rows. Never throws: a failure is
 * reported in `error`.
 * @param {PriceSource} source
 * @param {object} how
 * @param {(url: string) => Promise<{status: number, body: string}>} how.fetchText
 * @param {(html: string) => Document} how.parseHtml - Gives a cleaned document.
 * @returns {Promise<{name: string, url: string, official: boolean, rows: Array<any>, error?: string}>}
 */
export async function readSource(source, { fetchText, parseHtml }) {
  const result = {
    name: source.name,
    url: source.url,
    official: source.official,
    rows: [],
  };
  try {
    const page = await fetchText(source.url);
    if (page.status !== 200) {
      result.error = `HTTP ${page.status}`;
      return result;
    }
    /** @type {any} */
    const parsed = {};
    if (source.json) {
      parsed.json = JSON.parse(page.body);
    } else {
      parsed.document = parseHtml(page.body);
      parsed.tables = documentTables(parsed.document);
    }
    result.rows = source.extract(parsed);
    if (result.rows.length === 0) {
      result.error = 'no prices found (did the page layout change?)';
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}
