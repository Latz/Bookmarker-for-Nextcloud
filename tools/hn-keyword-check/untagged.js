#!/usr/bin/env node
// Runs the extension's real getData (src/background/modules/bookmarks) on every
// link of the Hacker News front page, without a browser, and writes the links
// that end up with neither keywords nor description to a file.
//
// Usage: node tools/hn-keyword-check/untagged.js [outfile]   (default hn-untagged.txt)
import './stubs.js';
import { writeFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { collectUrls, dedupeUrls, fetchWithUa } from './sources.js';

const outfile = process.argv[2] ?? 'hn-untagged.txt';
const silentConsole = new VirtualConsole();

// The only chrome APIs getData touches with deferCheck + skipFolders: the
// active tab, and injecting extractPageData into it (run here against the
// parsed page instead).
let current;
globalThis.chrome = {
  tabs: { query: async () => [{ id: 1, url: current.url, title: current.title }] },
  scripting: {
    executeScript: async ({ func, args }) => {
      globalThis.document = current.document;
      try {
        return [{ result: func(...args) }];
      } finally {
        delete globalThis.document;
      }
    },
  },
};
const { default: getData } = await import(
  new URL('../../src/background/modules/bookmarks/getData.js', import.meta.url)
);

const [{ urls, error }] = await collectUrls({ sources: ['hn'], feeds: [], pages: 1 });
if (error) console.log(`hn: stopped: ${error}`);
const links = dedupeUrls(urls);
console.log(`hn: ${links.length} link(s)`);

// Download in parallel, evaluate one by one (getData reads the shared globals).
const pages = await Promise.all(
  links.map(async (url) => {
    try {
      const response = await fetchWithUa(url);
      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('html')) return { url, skipped: `content-type ${type}` };
      return { url, html: await response.text(), finalUrl: response.url };
    } catch (e) {
      return { url, skipped: e.message };
    }
  }),
);

const untagged = [];
for (const page of pages) {
  if (page.skipped) {
    console.log(`skipped  ${page.url}  (${page.skipped})`);
    continue;
  }
  const dom = new JSDOM(page.html, { url: page.finalUrl, virtualConsole: silentConsole });
  current = {
    url: page.finalUrl,
    title: dom.window.document.title,
    document: dom.window.document,
  };
  const data = await getData({ deferCheck: true, skipFolders: true });
  dom.window.close();
  const empty = data.ok && !data.keywords?.length && !data.description;
  console.log(
    `${data.ok ? (empty ? 'EMPTY  ' : 'ok     ') : 'error  '} ${page.url}${data.ok ? '' : `  (${data.error})`}`,
  );
  if (empty) untagged.push(page.url);
}
await writeFile(outfile, untagged.join('\n') + '\n');
console.log(`${untagged.length} without keywords and description -> ${outfile}`);
