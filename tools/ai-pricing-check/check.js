#!/usr/bin/env node
// Reads the providers' price pages and compares the model prices with the
// list in src/lib/aiPricing.js, which the options page uses to estimate what
// the AI calls cost.
//
// Sources: the price pages of Anthropic, OpenAI, Google, DeepSeek, Groq (the
// models table of its console docs) and Mistral (the pricing page of its docs) as the official prices, and OpenRouter's model list
// (used to cross-check OpenAI/Anthropic/Google prices and to fill in models
// whose page cannot be read). Models a page does not price publicly (Groq's
// Llama models say "Contact Sales") keep their hand-entered price and are
// listed as "on no page".
//
// Usage: node check.js [--write] [--force] [--source <name>]... [--json <file>]
//                      [--verbose]
//   --write   write changed and new prices into src/lib/aiPricing.js
//   --force   with --write: also write changes that look implausible (a price
//             that became more than 10x higher or lower)
//   --source  only these sources (anthropic, openai, google, deepseek, groq, mistral, openrouter)
//   --json    also save the full result
// Exit code 1 if a source could not be read.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { PRICES } from '../../src/lib/aiPricing.js';
import { MODEL_INFO } from '../../src/lib/aiModelInfo.js';
import {
  collectInfo,
  compare,
  renderBlock,
  renderInfoFile,
  replaceBlock,
} from './compare.js';
import { SOURCES, readSource } from '../../src/lib/aiPriceSources.js';
import { fetchPage, parseHtml } from './pages.js';

const PRICES_FILE = new URL('../../src/lib/aiPricing.js', import.meta.url);
const INFO_FILE = new URL('../../src/lib/aiModelInfo.js', import.meta.url);

const { values: args } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
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

  const report = compare(sources, PRICES);

  const section = (title, rows, print) => {
    if (rows.length === 0) return;
    console.log(`\n${title}`);
    rows.forEach((row) => console.log(`  ${print(row)}`));
  };
  section(
    'Changed prices',
    report.changed,
    (row) =>
      `${row.prefix}  ${fmt(row.old.input)} / ${fmt(row.old.output)}  ->  ${fmt(row.input)} / ${fmt(row.output)}  (${row.source})${
        row.suspicious ? '  SUSPICIOUS (more than 10x)' : ''
      }`,
  );
  section(
    'New models (official pages)',
    report.added,
    (row) => `${rowText(row)}  (${row.source})`,
  );
  section(
    'Official page and OpenRouter disagree (official wins)',
    report.conflicts,
    (c) =>
      `${c.prefix}  page ${fmt(c.official.input)} / ${fmt(c.official.output)}  OpenRouter ${fmt(c.openrouter.input)} / ${fmt(c.openrouter.output)}`,
  );
  section(
    'In the list but on no page (check by hand)',
    report.missing,
    (p) => p,
  );
  if (args.verbose) {
    section(
      'Unchanged',
      report.unchanged,
      (row) => `${rowText(row)}  (${row.source})`,
    );
  }
  if (report.changed.length + report.added.length === 0) {
    console.log('\nNo price differences found.');
  }

  if (args.json) {
    await writeFile(args.json, JSON.stringify({ sources, report }, null, 2));
  }

  // Details of the models (context window, release date, ...) for the
  // tooltip of the cheapest-models box: what is known already, updated with
  // what the pages and OpenRouter say now.
  const prefixes = new Set([
    ...PRICES.map(([prefix]) => prefix),
    ...report.added.map((row) => row.prefix),
  ]);
  const collected = collectInfo(sources, prefixes);
  const info = {};
  for (const prefix of prefixes) {
    const merged = { ...MODEL_INFO[prefix], ...collected[prefix] };
    if (Object.keys(merged).length > 0) info[prefix] = merged;
  }
  const infoChanged = Object.keys(info).filter(
    (prefix) =>
      JSON.stringify(info[prefix]) !== JSON.stringify(MODEL_INFO[prefix]),
  );
  console.log(
    `\nModel details: ${Object.keys(info).length} models, ${infoChanged.length} new or changed.`,
  );

  if (args.write) {
    const next = new Map(PRICES.map(([p, i, o]) => [p, [p, i, o]]));
    let applied = 0;
    let skipped = 0;
    for (const row of [...report.changed, ...report.added]) {
      if (row.suspicious && !args.force) {
        skipped++;
        continue;
      }
      next.set(row.prefix, [row.prefix, row.input, row.output]);
      applied++;
    }
    if (applied > 0) {
      const source = await readFile(PRICES_FILE, 'utf8');
      await writeFile(
        PRICES_FILE,
        replaceBlock(source, renderBlock([...next.values()])),
      );
    }
    if (infoChanged.length > 0) {
      await writeFile(INFO_FILE, renderInfoFile(info));
      console.log(
        `\nWrote the details of ${infoChanged.length} models to src/lib/aiModelInfo.js`,
      );
    }
    console.log(
      `\nWrote ${applied} price${applied === 1 ? '' : 's'} to src/lib/aiPricing.js` +
        (skipped
          ? ` (${skipped} suspicious skipped -- check them, then --force)`
          : ''),
    );
  } else if (report.changed.length + report.added.length > 0) {
    console.log('\nRun with --write to update src/lib/aiPricing.js.');
  }

  process.exitCode = sources.some((source) => source.error) ? 1 : 0;
}

await main();
