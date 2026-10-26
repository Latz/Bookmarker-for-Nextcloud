// Loads dist/ into a real Chromium and asks the background for getData on a
// list of pages. Checks what unit tests cannot: what Chrome lets us script.
// Usage: npm run build && npm run test:e2e [-- <url> ...]
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// expect: 'ok' = description or keywords found, 'ok-empty' = form data but
// nothing extracted (Chrome refuses scripting), 'fail' = not bookmarkable.
const PAGES = [
  ['https://developer.mozilla.org/en-US/docs/Web/API/Window', 'ok'],
  ['https://github.com/microsoft/playwright', 'ok'],
  [
    'https://chromewebstore.google.com/detail/luna-adblock-for-youtube/ehfcoplbhoohillcmlophcfghpeilfjc',
    'ok-empty',
  ],
  ['chrome://version/', 'fail'],
];
// --hn <file>: take the links of the Hacker News front page and write those
// without keywords and description to <file>.
const hnFile = process.argv[2] === '--hn' ? (process.argv[3] ?? 'hn-untagged.txt') : null;
let pages;
if (hnFile) {
  const html = await (await fetch('https://news.ycombinator.com/')).text();
  const links = [...html.matchAll(/class="titleline"><a href="([^"]+)"/g)].map(
    (m) => new URL(m[1].replaceAll('&amp;', '&'), 'https://news.ycombinator.com/').href,
  );
  pages = links.map((u) => [u, null]);
} else {
  pages = process.argv.slice(2).length
    ? process.argv.slice(2).map((u) => [u, null])
    : PAGES;
}
const untagged = [];

// The real extension gets host access through activeTab (a toolbar click),
// which automation cannot do; a copy with <all_urls> stands in for it.
// Pages Chrome never lets extensions script (Web Store) stay blocked.
const ext = mkdtempSync(join(tmpdir(), 'bookmarker-e2e-'));
cpSync('dist', ext, { recursive: true });
const manifestPath = join(ext, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(manifestPath, JSON.stringify(manifest));

const context = await chromium.launchPersistentContext(join(ext, 'profile'), {
  channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const worker =
  context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extId = new URL(worker.url()).host;

// Messages come from an extension page in its own window, so the page under
// test stays the active tab of the last focused window.
const sender = await context.newPage();
await sender.goto(`chrome-extension://${extId}/src/popup/popup.html`);
let failed = 0;
for (const [url, expect] of pages) {
  const tab = await context.newPage();
  await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await tab.bringToFront();
  const r = await sender.evaluate(
    () =>
      chrome.runtime.sendMessage({
        msg: 'getData',
        data: { deferCheck: true, skipFolders: true },
      }),
  );
  const got = !r.ok ? 'fail' : r.keywords?.length || r.description ? 'ok' : 'ok-empty';
  const pass = expect === null || got === expect;
  if (!pass) failed++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${got.padEnd(8)} (want ${expect ?? '-'}) ${url}\n     title=${JSON.stringify(r.title)} keywords=${JSON.stringify(r.keywords)} description=${JSON.stringify((r.description ?? "").slice(0, 60))} error=${r.error ?? ''}`,
  );
  if (got === 'ok-empty' || got === 'fail') untagged.push(`${url}	${got}`);
  await tab.close();
}
if (hnFile) writeFileSync(hnFile, untagged.join('\n') + '\n');
await context.close();
process.exit(failed ? 1 : 0);
