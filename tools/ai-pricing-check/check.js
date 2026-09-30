#!/usr/bin/env node
// Reads the providers' price pages and compares the model prices with the
// list in src/lib/aiPricing.js, which the options page uses to estimate what
// the AI calls cost.
//
// Sources: the price pages of Anthropic, OpenAI, Google and DeepSeek (official
// prices), and OpenRouter's model list (used to cross-check OpenAI/Anthropic/
// Google prices and to fill in models whose page cannot be read). Mistral's
// and Groq's price pages are rendered by JavaScript and hold no prices in the
// HTML, so those models keep their hand-entered prices.
//
// Usage: node check.js [--write] [--force] [--source <name>]... [--json <file>]
//                      [--verbose]
//   --write   write changed and new prices into src/lib/aiPricing.js
//   --force   with --write: also write changes that look implausible (a price
//             that became more than 10x higher or lower)
//   --source  only these sources (anthropic, openai, google, deepseek, openrouter)
//   --json    also save the full result
// Exit code 1 if a source could not be read.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { PRICES } from '../../src/lib/aiPricing.js';
import { compare, renderBlock, replaceBlock } from './compare.js';
import {
  extractAnthropic,
  extractDeepSeek,
  extractGoogle,
  extractOpenAI,
  extractOpenRouter,
} from './extractors.js';
import { documentTables, fetchPage, parseHtml } from './pages.js';

const PRICES_FILE = new URL('../../src/lib/aiPricing.js', import.meta.url);

const SOURCES = [
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
    extract: ({ tables }) => extractDeepSeek(tables),
  },
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/models',
    official: false,
    json: true,
    extract: ({ json }) => extractOpenRouter(json),
  },
];

const { values: args } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    source: { type: 'string', multiple: true },
    json: { type: 'string' },
    verbose: { type: 'boolean', short: 'v', default: false },
  },
});

/**
 * Downloads one source and extracts its rows.
 * @param {(typeof SOURCES)[number]} source
 * @returns {Promise<{name: string, url: string, official: boolean, rows: Array<any>, error?: string}>}
 */
async function readSource(source) {
  const result = {
    name: source.name,
    url: source.url,
    official: source.official,
    rows: [],
  };
  try {
    const page = await fetchPage(source.url);
    if (page.status !== 200) {
      result.error = `HTTP ${page.status}`;
      return result;
    }
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
    result.error = error.message;
  }
  return result;
}

const fmt = (n) => `$${n}`;
const rowText = (row) =>
  `${row.prefix}  ${fmt(row.input)} / ${fmt(row.output)}`;

async function main() {
  const wanted = args.source?.length ? new Set(args.source) : null;
  const chosen = SOURCES.filter((source) => !wanted || wanted.has(source.name));
  const sources = await Promise.all(chosen.map(readSource));

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
