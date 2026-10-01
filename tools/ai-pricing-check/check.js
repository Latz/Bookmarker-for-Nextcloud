#!/usr/bin/env node
// Reads the providers' price pages the way the extension does when the user
// updates the prices (same code, src/lib/aiPriceSources.js) and prints what
// they say -- to see what the extension will read, and to find out which page
// changed its layout. It changes nothing: the extension has no built-in prices.
//
// Sources: the price pages of Anthropic, OpenAI, Google, DeepSeek, Groq (the
// models table of its console docs) and Mistral (the pricing page of its docs)
// as the official prices, and OpenRouter's model list (used to cross-check the
// OpenAI/Anthropic/Google prices and to fill in the models the official pages
// do not list).
//
// Usage: node check.js [--source <name>]... [--json <file>] [--verbose]
//   --source   only these sources (anthropic, openai, google, deepseek, groq,
//              mistral, openrouter)
//   --json     also save the full result
//   --verbose  list every model with its price
// Exit code 1 if a source could not be read.
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { collectInfo, compare } from '../../src/lib/aiPriceMerge.js';
import { SOURCES, readSource } from '../../src/lib/aiPriceSources.js';
import { fetchPage, parseHtml } from './pages.js';

const { values: args } = parseArgs({
  options: {
    source: { type: 'string', multiple: true },
    json: { type: 'string' },
    verbose: { type: 'boolean', short: 'v', default: false },
  },
});

const fmt = (n) => `$${n}`;
const rowText = (row) =>
  `${row.prefix}  ${fmt(row.input)} / ${fmt(row.output)}`;

async function main() {
  const wanted = args.source?.length ? new Set(args.source) : null;
  const chosen = SOURCES.filter((source) => !wanted || wanted.has(source.name));
  const how = {
    fetchText: async (url) => {
      const page = await fetchPage(url);
      return { status: page.status, body: page.body };
    },
    parseHtml,
  };
  const sources = await Promise.all(
    chosen.map((source) => readSource(source, how)),
  );

  console.log('Sources');
  for (const source of sources) {
    console.log(
      `  ${source.error ? 'FAIL' : 'ok  '} ${source.name.padEnd(10)} ${
        source.error ?? `${source.rows.length} models`
      }`,
    );
  }

  // As the extension sees it the first time: nothing is known yet
  const report = compare(sources, []);
  const prefixes = new Set(report.added.map((row) => row.prefix));
  const info = collectInfo(sources, prefixes);
  console.log(
    `\n${report.added.length} models with a price, ${Object.keys(info).length} with details.`,
  );

  if (args.verbose) {
    console.log('\nPrices (dollars per million tokens, input / output)');
    for (const row of report.added) {
      console.log(`  ${rowText(row).padEnd(52)} (${row.source})`);
    }
  }
  if (report.conflicts.length > 0) {
    console.log('\nOfficial page and OpenRouter disagree (the page wins)');
    for (const c of report.conflicts) {
      console.log(
        `  ${c.prefix}  page ${fmt(c.official.input)} / ${fmt(c.official.output)}  OpenRouter ${fmt(c.openrouter.input)} / ${fmt(c.openrouter.output)}`,
      );
    }
  }

  if (args.json) {
    await writeFile(
      args.json,
      JSON.stringify({ sources, prices: report.added, info }, null, 2),
    );
  }
  process.exitCode = sources.some((source) => source.error) ? 1 : 0;
}

await main();
