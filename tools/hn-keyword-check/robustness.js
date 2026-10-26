#!/usr/bin/env node
// Robustness check: feeds hostile / broken pages through the real getData
// (src/background/modules/bookmarks), no browser, no network. Each page must
// give { ok: true } without throwing and within TIME_LIMIT_MS.
// Usage: node tools/hn-keyword-check/robustness.js
import './stubs.js';
import { JSDOM, VirtualConsole } from 'jsdom';

const TIME_LIMIT_MS = 3000;
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

const head = (s) => `<html><head>${s}</head><body></body></html>`;
const CASES = {
  'empty document': '',
  'not html at all': '\u0000\u0001 binary ￿ garbage',
  'unclosed tags': '<html><head><meta name="keywords" content="a,b"><title>x<body><a rel="tag">t',
  'meta without content': head('<meta name="keywords"><meta name="description"><meta>'),
  'keywords only separators': head('<meta name="keywords" content=",,, | ;; ,">'),
  'invalid json-ld': head('<script type="application/ld+json">{"keywords": [1,</script>'),
  'json-ld with wrong types': head(
    '<script type="application/ld+json">{"@type":"Article","keywords":{"a":1},"@graph":[null,5,"x",[]]}</script>',
  ),
  'json-ld "null"': head('<script type="application/ld+json">null</script>'),
  'unclosed keywords regex (100k)': head(`<script>${'keywords:['.repeat(100000)}</script>`),
  'unpaired quotes regex (100k)': head(`<script>${'"keywords":"'.repeat(100000)}</script>`),
  'dataLayer.push garbage': head('<script>dataLayer.push({keywords: </script><script>dataLayer.push(</script>'),
  'xplGlobal garbage': head('<script>xplGlobal.document.metadata={"keywords":[null];</script>'),
  'invalid __NEXT_DATA__': head('<script id="__NEXT_DATA__">{{{</script>'),
  '5 MB script': head(`<script>${'x'.repeat(5_000_000)}</script>`),
  '50k meta tags': head('<meta name="keywords" content="k">'.repeat(50000)),
  '20k rel=tag links': `<body>${'<a rel="tag">t</a>'.repeat(20000)}</body>`,
  '20k headings': `<body>${'<h1>h</h1>'.repeat(20000)}</body>`,
  'deeply nested (5k)': `<body>${'<div>'.repeat(5000)}x${'</div>'.repeat(5000)}</body>`,
  'huge keyword list (200k)': head(`<meta name="keywords" content="${'k,'.repeat(200000)}">`),
  'huge description (2 MB)': head(`<meta name="description" content="${'d'.repeat(2_000_000)}">`),
  'html-injection in values': head(
    '<meta name="keywords" content="&lt;script&gt;alert(1)&lt;/script&gt;,&quot;&gt;&lt;img src=x&gt;"><meta name="description" content="&lt;b&gt;">',
  ),
  'prototype-pollution names': head(
    '<meta name="__proto__" content="x"><meta property="constructor" content="y"><meta name="toString" content="z">',
  ),
};

let failed = 0;
for (const [name, html] of Object.entries(CASES)) {
  const url = 'https://example.test/page';
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  current = { url, title: dom.window.document.title, document: dom.window.document };
  const start = performance.now();
  let verdict;
  try {
    const data = await getData({ deferCheck: true, skipFolders: true });
    verdict = data.ok ? null : `not ok: ${data.error}`;
    if (data.ok && !Array.isArray(data.keywords)) verdict = 'keywords is not an array';
    if (data.ok && typeof data.description !== 'string') verdict = 'description is not a string';
  } catch (e) {
    verdict = `threw: ${e.message}`;
  }
  const ms = Math.round(performance.now() - start);
  if (!verdict && ms > TIME_LIMIT_MS) verdict = `too slow: ${ms} ms`;
  if (verdict) failed++;
  console.log(`${verdict ? 'FAIL' : 'ok  '} ${String(ms).padStart(5)} ms  ${name}${verdict ? `  -> ${verdict}` : ''}`);
  dom.window.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
