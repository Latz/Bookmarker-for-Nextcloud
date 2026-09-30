#!/usr/bin/env node
// Development helper: saves the text and tables of the pricing pages, so the
// extractors can be written and debugged against what the tool really sees.
//
// Usage: node dump.js <outDir> <url> [url ...]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { documentTables, documentText, fetchPage, parseHtml } from './pages.js';

const [outDir, ...urls] = process.argv.slice(2);
if (!outDir) {
  console.error('Usage: node dump.js <outDir> <url> [url ...]');
  process.exit(2);
}
await mkdir(outDir, { recursive: true });

for (const url of urls) {
  const name = new URL(url).host.replace(/[^a-z0-9]+/gi, '_');
  try {
    const page = await fetchPage(url);
    console.log(`${page.status} ${url} (${page.body.length} bytes)`);
    if (page.type.includes('json')) {
      await writeFile(path.join(outDir, `${name}.json`), page.body);
      continue;
    }
    const document = parseHtml(page.body);
    await writeFile(path.join(outDir, `${name}.txt`), documentText(document));
    await writeFile(
      path.join(outDir, `${name}.tables.json`),
      JSON.stringify(documentTables(document), null, 1),
    );
  } catch (error) {
    console.log(`FAIL ${url}: ${error.message}`);
  }
}
