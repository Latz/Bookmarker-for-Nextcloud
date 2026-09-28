#!/usr/bin/env node
// Loads the Hacker News front page, checks every linked page for keywords,
// tags and descriptions with an independent detector, and verifies that
// Bookmarker for Nextcloud's own extraction code (../../src) finds them too.
//
// Usage: node check.js [--url <url>] [--limit N] [--json <file>] [--verbose]
import './stubs.js';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { Window } from 'happy-dom';
import { detectReference } from './reference.js';

const src = new URL('../../src/background/modules/', import.meta.url);
const { extractPageData } = await import(new URL('extractPageData.js', src));
const { createMockDocument } = await import(new URL('mockDocument.js', src));
const { default: getDescription } = await import(
  new URL('getDescription.js', src)
);
const { default: getKeywords } = await import(new URL('getKeywords.js', src));
const { OPTIONS } = await import('./stub-storage.js');

const HN_URL = 'https://news.ycombinator.com/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;
const CONCURRENCY = 5;

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', multiple: true },
    limit: { type: 'string' },
    json: { type: 'string' },
    verbose: { type: 'boolean', short: 'v', default: false },
  },
});

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('html')) return { skipped: `content-type ${type}` };
  return { html: await response.text(), finalUrl: response.url };
}

function parseDocument(html, url) {
  const window = new Window({
    url,
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
      navigation: { disableChildFrameNavigation: true },
    },
  });
  const document = new window.DOMParser().parseFromString(html, 'text/html');
  return { window, document };
}

async function getStoryUrls() {
  const { html } = await fetchHtml(HN_URL);
  const { window, document } = parseDocument(html, HN_URL);
  const urls = Array.from(document.querySelectorAll('.titleline > a'))
    .map((a) => new URL(a.getAttribute('href'), HN_URL).href)
    // Ask/Show HN text posts link back to HN itself and carry no metadata.
    .filter((url) => !url.startsWith(`${HN_URL}item?`));
  await window.happyDOM.close();
  return urls;
}

// Same steps as getData.js: extract in-page, build the mock document, then
// run getDescription and getKeywords on it.
async function runExtension(document) {
  const previous = globalThis.document;
  globalThis.document = document;
  let parsedData;
  try {
    parsedData = extractPageData(OPTIONS.input_headings_slider);
  } finally {
    globalThis.document = previous;
  }
  if (parsedData.error) throw new Error(`extractPageData: ${parsedData.error}`);

  const mockDoc = createMockDocument(parsedData);
  return {
    description: getDescription(mockDoc),
    keywords: await getKeywords(parsedData, mockDoc),
  };
}

const norm = (keyword) => keyword.trim().toLowerCase();

function classify(reference, extension) {
  const refKeywords = [...new Set(Object.values(reference.keywords).flat())];
  const refHasDescription = Object.keys(reference.descriptions).length > 0;
  const extKeywords = new Set(extension.keywords.map(norm));

  const statuses = [];
  if (refKeywords.length && extKeywords.size === 0) statuses.push('MISS-KW');
  if (refHasDescription && !extension.description) statuses.push('MISS-DESC');

  const refOnly = refKeywords.filter((k) => !extKeywords.has(norm(k)));
  if (statuses.length === 0 && refOnly.length) statuses.push('partial');

  if (statuses.length === 0) {
    statuses.push(refKeywords.length || refHasDescription ? 'ok' : 'none');
  }
  return { status: statuses.join(','), refOnly };
}

async function checkUrl(url) {
  const result = { url };
  try {
    const fetched = await fetchHtml(url);
    if (fetched.skipped) return { ...result, status: 'skipped', note: fetched.skipped };

    const { window, document } = parseDocument(fetched.html, fetched.finalUrl);
    try {
      result.reference = detectReference(document);
      result.extension = await runExtension(document);
    } finally {
      await window.happyDOM.close();
    }
    Object.assign(result, classify(result.reference, result.extension));
  } catch (error) {
    result.status = 'error';
    result.note = error.name === 'TimeoutError' ? 'timeout' : error.message;
  }
  return result;
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const truncate = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

function printResult(r) {
  const host = truncate(new URL(r.url).hostname.replace(/^www\./, ''), 30);
  const status = r.status.padEnd(17);
  if (!r.reference) {
    console.log(`${status} ${host.padEnd(30)} ${r.note ?? ''}`);
    return;
  }
  const refSources = Object.keys(r.reference.keywords).join(' ') || '-';
  console.log(
    `${status} ${host.padEnd(30)} ext kw: ${String(r.extension.keywords.length).padStart(3)}  ref: ${refSources}`,
  );

  const interesting = r.status !== 'ok' && r.status !== 'none';
  if (!interesting && !args.verbose) return;

  console.log(`    ${r.url}`);
  for (const [source, keywords] of Object.entries(r.reference.keywords)) {
    console.log(`    ref ${source}: ${truncate(keywords.join(', '), 150)}`);
  }
  for (const [source, description] of Object.entries(r.reference.descriptions)) {
    console.log(`    ref ${source}: ${truncate(description, 100)}`);
  }
  console.log(`    ext keywords: ${truncate(r.extension.keywords.join(', ') || '-', 150)}`);
  console.log(`    ext description: ${truncate(r.extension.description || '-', 100)}`);
  if (r.refOnly?.length && r.extension.keywords.length) {
    console.log(`    ref-only: ${truncate(r.refOnly.join(', '), 150)}`);
  }
}

let urls = args.url ?? (await getStoryUrls());
if (args.limit) urls = urls.slice(0, Number(args.limit));
console.log(`Checking ${urls.length} page(s)…\n`);

const results = await mapConcurrent(urls, CONCURRENCY, checkUrl);
results.forEach(printResult);

const counts = {};
for (const r of results) {
  for (const status of r.status.split(',')) counts[status] = (counts[status] ?? 0) + 1;
}
console.log(
  `\nSummary: ${Object.entries(counts)
    .map(([status, n]) => `${status}=${n}`)
    .join('  ')}`,
);

if (args.json) {
  await writeFile(args.json, JSON.stringify(results, null, 2));
  console.log(`Wrote ${args.json}`);
}

process.exitCode = results.some((r) => r.status.includes('MISS')) ? 1 : 0;
