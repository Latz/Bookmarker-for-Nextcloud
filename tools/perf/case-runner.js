#!/usr/bin/env node
// Runs ONE benchmark case against the source tree at --root and prints a single
// line "@@RESULT@@ {json}" (compare.js parses it). One case per process keeps
// module state, the fake IndexedDB and any hang isolated -- a hostile input can
// run for minutes on old code, so the caller puts a timeout on the process.
//
//   node tools/perf/case-runner.js --root . --case extract:test-html
//   node tools/perf/case-runner.js --root . --case list
import { sessionStore, installChrome } from './stubs.js';
import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { moduleUrl, libUrl } from './resolve.js';

const { values: args } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    case: { type: 'string' },
    fixtures: { type: 'string' },
  },
});
const ROOT = resolve(args.root);
const FIXTURES = resolve(args.fixtures ?? args.root);

// The extension logs a lot ('init background', 'oldversion', ...). Keep stdout
// for the result line only.
console.log = console.warn = console.info = () => {};

const mod = (name) => import(moduleUrl(ROOT, name));
const lib = (name) => import(libUrl(ROOT, name));
const hash = (value) =>
  createHash('sha1').update(JSON.stringify(value) ?? 'undefined').digest('hex').slice(0, 12);

// ---------------------------------------------------------------------------
// timing
// ---------------------------------------------------------------------------
/**
 * Times fn() repeatedly. Per-operation numbers: with `ops` > 1 one call does
 * that many operations and the result is divided.
 */
async function bench(
  fn,
  { warmup = 3, min = 5, max = 200, budgetMs = 800, ops = 1, beforeEach } = {},
) {
  for (let i = 0; i < warmup; i++) {
    if (beforeEach) await beforeEach(i);
    await fn(i);
  }
  const samples = [];
  const start = performance.now();
  while (samples.length < max && (samples.length < min || performance.now() - start < budgetMs)) {
    if (beforeEach) await beforeEach(samples.length);
    const t0 = performance.now();
    await fn(samples.length);
    samples.push((performance.now() - t0) / ops);
  }
  samples.sort((a, b) => a - b);
  const pick = (q) => samples[Math.min(samples.length - 1, Math.floor(q * (samples.length - 1)))];
  return {
    median: pick(0.5),
    min: samples[0],
    p95: pick(0.95),
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    n: samples.length,
    unit: 'ms',
  };
}
const ONCE = { warmup: 0, min: 1, max: 1, budgetMs: 0 };

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------
const silentConsole = new VirtualConsole();

/** Parses html with jsdom and makes it the global `document` extractPageData reads. */
function useDocument(html, url = 'https://example.com/article') {
  const dom = new JSDOM(html, { url, virtualConsole: silentConsole });
  globalThis.document = dom.window.document;
  return dom;
}

function fixture(name) {
  const path = join(FIXTURES, name);
  if (!existsSync(path)) throw new Error(`fixture not found: ${path} (pass --fixtures)`);
  return readFileSync(path, 'utf8');
}

const LIGHT_HTML = `<!doctype html><html><head>
  <title>A short article</title>
  <meta name="description" content="A short description of the page.">
  <meta name="keywords" content="alpha, beta, gamma">
  <script type="application/ld+json">{"@type":"Article","keywords":["alpha","delta"]}</script>
  </head><body><h1>Alpha and beta</h1><h2>Gamma news</h2><p>Text.</p></body></html>`;

const NO_KEYWORDS_HTML = `<!doctype html><html><head>
  <title>Notes about space telescopes</title>
  <meta name="description" content="Notes about space, telescopes and astronomy for beginners.">
  </head><body><h1>Space telescopes</h1><h2>Astronomy basics</h2><h3>Mirrors and optics</h3></body></html>`;

const script = (body) => `<!doctype html><html><body><script>${body}</script></body></html>`;

const seedTags = (count) => [
  'space', 'astronomy', 'optics', 'telescopes', 'science',
  ...Array.from({ length: count }, (_, i) => `tag${String(i).padStart(4, '0')}`),
];

// ---------------------------------------------------------------------------
// shared setup
// ---------------------------------------------------------------------------
async function prepareStorage({ credentials = true, options = {}, tags = 0 } = {}) {
  const storage = await lib('storage');
  const cache = await lib('cache');
  await storage.initDefaults();
  if (Object.keys(options).length) await storage.store_data('options', options);
  if (credentials) {
    await storage.store_data('credentials', {
      server: 'https://cloud.example.com',
      loginname: 'user',
      appPassword: 'app-password',
    });
  }
  if (tags) await cache.cacheAdd('keywords', seedTags(tags));
  return { storage, cache };
}

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------
async function extractCase(html, url, opts = {}) {
  const { extractPageData } = await mod('extractPageData');
  useDocument(html, url);
  const stats = await bench(() => extractPageData(3), opts);
  const data = extractPageData(3);
  if (data.error) throw new Error(`extractPageData: ${data.error}`);
  return {
    stats,
    // what crosses the structured-clone boundary to the service worker
    payloadBytes: JSON.stringify(data).length,
    resultHash: hash([data.bruteForceKeywords, data.xplKeywords, data.aRelTag, data.jsonLdScripts.length]),
  };
}

async function pipelineCase({ html, url, extended, tags, reduce = extended }) {
  await prepareStorage({
    tags,
    options: {
      cbx_autoTags: true,
      cbx_extendedKeywords: extended,
      cbx_reduceKeywords: reduce,
      input_headings_slider: 3,
    },
  });
  const { extractPageData } = await mod('extractPageData');
  const { createMockDocument } = await mod('mockDocument');
  const { default: getDescription } = await mod('getDescription');
  const { default: getKeywords } = await mod('getKeywords');
  useDocument(html, url);
  const run = async () => {
    const parsed = extractPageData(3);
    if (parsed.error) throw new Error(parsed.error);
    const mock = createMockDocument(parsed);
    return { description: getDescription(mock), keywords: await getKeywords(parsed, mock) };
  };
  const stats = await bench(run);
  const out = await run();
  return { stats, resultHash: hash(out), extra: { keywords: out.keywords.length } };
}

async function apiCase(fetchImpl) {
  await prepareStorage();
  const { default: apiCall } = await lib('apiCall');
  globalThis.fetch = fetchImpl;
  const run = () => apiCall('index.php/apps/bookmarks/public/rest/v2/bookmark', 'GET', 'page=0');
  const stats = await bench(run, { warmup: 50, min: 200, max: 5000, budgetMs: 800 });
  return { stats, resultHash: hash(await run()) };
}

const CASES = {
  // --- page extraction ---------------------------------------------------
  'extract:light': () => extractCase(LIGHT_HTML),
  'extract:test-html': () => extractCase(fixture('test.html'), 'https://arstechnica.com/science/example/'),
  'extract:x-html': () => extractCase(fixture('x.html'), 'https://www.heise.de/news/example.html'),
  'extract:big-dom': () =>
    extractCase(
      `<!doctype html><html><body>${'<div class="row"><span>text</span><a href="/x">link</a></div>'.repeat(60000)}</body></html>`,
    ),

  // --- hostile pages (the caller times these out) --------------------------
  'hostile:brute-open': () => extractCase(script('keywords:['.repeat(60000)), undefined, ONCE),
  'hostile:quote-open': () => extractCase(script('keywords:"'.repeat(60000)), undefined, ONCE),
  'hostile:xpl-open': () =>
    extractCase(script('xplGlobal.document.metadata='.repeat(20000)), undefined, ONCE),
  'hostile:gtm-open': async () => {
    const { extractPageData } = await mod('extractPageData');
    const { createMockDocument } = await mod('mockDocument');
    const { extractGtmKeywords } = await mod('keywords/pageSources');
    useDocument(script('dataLayer.push({"a":'.repeat(50000)));
    const run = () => {
      const parsed = extractPageData(3);
      return extractGtmKeywords(createMockDocument(parsed));
    };
    return { stats: await bench(run, ONCE), resultHash: hash(run()) };
  },

  // --- extraction + keywords with a real (fake) IndexedDB --------------------
  'pipeline:test-html': () =>
    pipelineCase({ html: fixture('test.html'), url: 'https://arstechnica.com/science/example/', extended: false, tags: 2000 }),
  'pipeline:x-html': () =>
    pipelineCase({ html: fixture('x.html'), url: 'https://www.heise.de/news/example.html', extended: false, tags: 2000 }),
  // The saved fixtures carry no keywords, so this page exercises merging and
  // reducing: 60 meta keywords, 30 rel=tag links and 40 JSON-LD keywords
  // against 2000 stored tags.
  'pipeline:keyword-rich': () => {
    const tag = (i) => `tag${String(i * 7).padStart(4, '0')}`;
    const metaKeywords = Array.from({ length: 60 }, (_, i) => tag(i)).join(', ');
    const relTags = Array.from({ length: 30 }, (_, i) => `<a rel="tag" href="/t/${i}">${tag(i + 20)}</a>`).join('');
    const jsonLd = JSON.stringify({ '@type': 'NewsArticle', keywords: Array.from({ length: 40 }, (_, i) => tag(i + 50)) });
    return pipelineCase({
      html: `<!doctype html><html><head><meta name="keywords" content="${metaKeywords}">
        <meta name="description" content="A page full of tags."><script type="application/ld+json">${jsonLd}</script>
        </head><body><h1>Tags</h1>${relTags}</body></html>`,
      url: undefined,
      extended: false,
      tags: 2000,
      reduce: true,
    });
  },
  'pipeline:light-extended': () =>
    pipelineCase({ html: NO_KEYWORDS_HTML, url: undefined, extended: true, tags: 2000 }),

  // --- pure functions --------------------------------------------------------
  'merge:10k': async () => {
    const { mergeKeywords } = await mod('getKeywords');
    const input = Array.from({ length: 10000 }, (_, i) => (i % 3 ? `Tag ${i % 4000}` : `tag ${i % 4000}`));
    const stats = await bench(() => mergeKeywords(input), { ops: 1 });
    return { stats, resultHash: hash(mergeKeywords(input).length), extra: { kept: mergeKeywords(input).length } };
  },
  'jsonld:typical': async () => {
    const { extractJsonLdKeywords } = await mod('keywords/jsonLdKeywords');
    const doc = {
      querySelectorAll: () => [
        { innerText: JSON.stringify({ '@type': 'Organization', name: 'x' }) },
        { innerText: JSON.stringify({ '@type': 'NewsArticle', keywords: ['a', 'b', 'c'] }) },
      ],
    };
    const stats = await bench(() => extractJsonLdKeywords(doc), { warmup: 100, min: 200, max: 20000 });
    return { stats, resultHash: hash(extractJsonLdKeywords(doc)) };
  },
  'jsonld:big-graph': async () => {
    const { extractJsonLdKeywords } = await mod('keywords/jsonLdKeywords');
    const graph = Array.from({ length: 5000 }, (_, i) => ({ '@type': 'ListItem', position: i, name: `item ${i}` }));
    graph.push({ '@type': 'NewsArticle', keywords: ['a', 'b'] });
    const doc = { querySelectorAll: () => [{ innerText: JSON.stringify({ '@graph': graph }) }] };
    const stats = await bench(() => extractJsonLdKeywords(doc));
    return { stats, resultHash: hash(extractJsonLdKeywords(doc)) };
  },

  // --- apiCall with a mocked fetch ---------------------------------------------
  'api:success': () =>
    apiCase(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: [] }) })),
  'api:network-error': () =>
    apiCase(async () => {
      throw new TypeError('Failed to fetch');
    }),
  'api:http-500': () =>
    apiCase(async () => ({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) })),
  'api:bad-json': () =>
    apiCase(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    })),

  // --- storage and cache on fake-indexeddb --------------------------------------
  'storage:getOption-hit': async () => {
    const { storage } = await prepareStorage();
    await storage.getOption('cbx_autoTags');
    const stats = await bench(async () => {
      for (let i = 0; i < 1000; i++) await storage.getOption('cbx_autoTags');
    }, { ops: 1000 });
    return { stats };
  },
  'storage:getOption-miss': async () => {
    const { storage } = await prepareStorage();
    const stats = await bench(async () => {
      storage.clearOptionsCache();
      await storage.getOption('cbx_autoTags');
    }, { warmup: 20, min: 100, max: 2000 });
    return { stats };
  },
  'storage:getOptions-batch': async () => {
    const { storage } = await prepareStorage();
    const keys = ['cbx_showUrl', 'cbx_showDescription', 'cbx_autoTags', 'cbx_showKeywords',
      'cbx_alreadyStored', 'cbx_reduceKeywords', 'input_headings_slider', 'folderIDs'];
    const stats = await bench(async () => {
      storage.clearOptionsCache();
      await storage.getOptions(keys);
    }, { warmup: 20, min: 100, max: 2000 });
    return { stats };
  },
  'storage:store_data': async () => {
    const { storage } = await prepareStorage();
    let i = 0;
    const stats = await bench(() => storage.store_data('options', { input_headings_slider: (i++ % 6) + 1 }),
      { warmup: 20, min: 100, max: 2000 });
    return { stats };
  },
  'cache:cacheGet-hit': async () => {
    const { cache } = await prepareStorage({ tags: 2000 });
    await cache.cacheGet('keywords');
    const stats = await bench(() => cache.cacheGet('keywords'), { warmup: 10, min: 50, max: 1000 });
    return { stats, resultHash: hash((await cache.cacheGet('keywords')).length) };
  },
  'cache:cacheTempAdd-seq': async () => {
    const { cache } = await prepareStorage({ tags: 200 });
    const reseed = () => cache.cacheAdd('keywords', seedTags(200));
    let round = 0;
    const stats = await bench(async () => {
      round++;
      for (let i = 0; i < 100; i++) await cache.cacheTempAdd('keywords', [`n${round}_${i}`]);
    }, { warmup: 1, min: 5, max: 20, budgetMs: 0, ops: 100, beforeEach: reseed });
    await reseed();
    for (let i = 0; i < 100; i++) await cache.cacheTempAdd('keywords', [`x${i}`]);
    return { stats, extra: { tagsAfter100: (await cache.cacheGet('keywords')).length } };
  },
  'cache:cacheTempAdd-concurrent': async () => {
    const { cache } = await prepareStorage({ tags: 200 });
    const reseed = () => cache.cacheAdd('keywords', seedTags(200));
    let round = 0;
    const stats = await bench(async () => {
      round++;
      await Promise.all(Array.from({ length: 100 }, (_, i) => cache.cacheTempAdd('keywords', [`n${round}_${i}`])));
    }, { warmup: 1, min: 5, max: 20, budgetMs: 0, ops: 100, beforeEach: reseed });
    await reseed();
    await Promise.all(Array.from({ length: 100 }, (_, i) => cache.cacheTempAdd('keywords', [`x${i}`])));
    // 100 concurrent adds of distinct tags should give 205 + 100 = 305 (seed has 205);
    // fewer means updates were lost
    return { stats, extra: { seed: seedTags(200).length, tagsAfter100: (await cache.cacheGet('keywords')).length } };
  },

  // --- service worker start ------------------------------------------------------
  'startup:init': async () => {
    const { storage } = await prepareStorage();
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: [] }) });
    const notification = await mod('notification');
    const theme = await mod('getBrowserTheme');
    const { init } = await mod('startup');
    const seed = () => {
      // as after the first start of a browser session
      sessionStore.browserTheme = 'dark';
      sessionStore.errorIconsAvailable = { light: true, dark: true };
    };
    const stats = await bench(async () => {
      await init();
    }, {
      warmup: 3, min: 30, max: 300,
      // cold start: module-level caches are gone, session storage is not
      beforeEach: () => {
        theme._resetCacheForTesting?.();
        notification._resetErrorIconCacheForTesting?.();
        seed();
      },
    });
    void storage;
    return { stats };
  },
  'startup:ensureDefaults-full': async () => {
    const { storage } = await prepareStorage();
    if (typeof storage.ensureDefaults !== 'function') return { skipped: 'not in this revision' };
    const stats = await bench(() => storage.ensureDefaults(), { warmup: 10, min: 50, max: 1000 });
    return { stats };
  },
  'startup:ensureDefaults-missing': async () => {
    const { storage } = await prepareStorage();
    if (typeof storage.ensureDefaults !== 'function') return { skipped: 'not in this revision' };
    const missing = ['cbx_fuzzyUrlMatch', 'cbx_cacheBookmarkChecks', 'input_bookmarkCacheTTL',
      'select_duplicateStrategy', 'input_titleCheckLimit'];
    const stats = await bench(() => storage.ensureDefaults(), {
      warmup: 5, min: 30, max: 500,
      beforeEach: () => storage.delete_data('options', ...missing),
    });
    return { stats };
  },
};

// ---------------------------------------------------------------------------
async function main() {
  if (args.case === 'list') {
    process.stdout.write(`@@RESULT@@ ${JSON.stringify({ cases: Object.keys(CASES) })}\n`);
    return;
  }
  const run = CASES[args.case];
  if (!run) throw new Error(`unknown case "${args.case}" (use --case list)`);
  installChrome();
  const result = await run();
  process.stdout.write(
    `@@RESULT@@ ${JSON.stringify({ case: args.case, root: ROOT, node: process.version, ...result })}\n`,
  );
}

main()
  .catch((error) => {
    process.stdout.write(
      `@@RESULT@@ ${JSON.stringify({ case: args.case, root: ROOT, error: error?.stack ?? String(error) })}\n`,
    );
  })
  // open IndexedDB connections and idle timers would keep the process alive
  .finally(() => process.exit(0));
