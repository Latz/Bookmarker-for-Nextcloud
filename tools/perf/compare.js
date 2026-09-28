#!/usr/bin/env node
// Before/after benchmark: builds a git worktree for each revision, runs every
// case of case-runner.js against both (one process per case, with a timeout,
// interleaved so machine drift hits both equally), builds both dist/ folders
// and prints a comparison.
//
//   node tools/perf/compare.js --base 1ec3016 --head HEAD --runs 5
//   node tools/perf/compare.js --base HEAD --head HEAD      # noise check
//
// What this measures: pure functions and the IndexedDB logic under Node with
// fake-indexeddb and a chrome mock. It does NOT measure script injection, the
// offscreen document, popup rendering or the network.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: '1ec3016' },
    head: { type: 'string', default: 'HEAD' },
    runs: { type: 'string', default: '5' },
    fixtures: { type: 'string' },
    json: { type: 'string' },
    md: { type: 'string' },
    cases: { type: 'string' }, // comma separated substrings
    threshold: { type: 'string', default: '10' },
    timeout: { type: 'string', default: '180' }, // seconds, normal cases
    'hostile-timeout': { type: 'string', default: '45' }, // seconds
    'skip-bundle': { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
});

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const REPO = git(process.cwd(), 'rev-parse', '--show-toplevel');
const RUNNER = fileURLToPath(new URL('./case-runner.js', import.meta.url));
const FIXTURES = resolve(args.fixtures ?? REPO);
const RUNS = Math.max(1, Number.parseInt(args.runs, 10) || 5);
const THRESHOLD = Number(args.threshold) / 100;
const log = (msg) => process.stderr.write(`${msg}\n`);

// ---------------------------------------------------------------------------
// worktrees
// ---------------------------------------------------------------------------
function makeWorktree(rev, label) {
  const sha = git(REPO, 'rev-parse', '--short', rev);
  const subject = git(REPO, 'log', '-1', '--format=%s', rev);
  const dir = join(tmpdir(), `bkn-perf-${label}-${sha}`);
  removeWorktree({ dir });
  git(REPO, 'worktree', 'add', '--detach', dir, rev);
  // A junction, so the worktree uses the real node_modules without a copy.
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return { rev, label, sha, subject, dir };
}

function removeWorktree(wt) {
  const nm = join(wt.dir, 'node_modules');
  if (existsSync(nm)) {
    // Remove the LINK first. A recursive delete of the worktree could follow
    // the junction into the real node_modules.
    try { rmdirSync(nm); } catch { try { unlinkSync(nm); } catch { /* fall through */ } }
    if (existsSync(nm)) throw new Error(`could not detach node_modules link at ${nm}; not deleting the worktree`);
  }
  if (existsSync(wt.dir)) {
    try { git(REPO, 'worktree', 'remove', '--force', wt.dir); } catch { rmSync(wt.dir, { recursive: true, force: true }); }
  }
  try { git(REPO, 'worktree', 'prune'); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// running cases
// ---------------------------------------------------------------------------
function listCases() {
  const r = spawnSync(process.execPath, [RUNNER, '--root', REPO, '--case', 'list'], { encoding: 'utf8' });
  const line = r.stdout.split('\n').find((l) => l.startsWith('@@RESULT@@'));
  let all = JSON.parse(line.slice('@@RESULT@@'.length)).cases;
  if (args.cases) {
    const wanted = args.cases.split(',').map((s) => s.trim());
    all = all.filter((c) => wanted.some((w) => c.includes(w)));
  }
  return all;
}

function runCase(wt, name) {
  const seconds = Number(name.startsWith('hostile:') ? args['hostile-timeout'] : args.timeout);
  const r = spawnSync(
    process.execPath,
    [RUNNER, '--root', wt.dir, '--case', name, '--fixtures', FIXTURES],
    { encoding: 'utf8', timeout: seconds * 1000, maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.error?.code === 'ETIMEDOUT') return { timeout: seconds };
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@RESULT@@'));
  if (!line) return { error: `no result (exit ${r.status}): ${(r.stderr ?? '').slice(0, 300)}` };
  return JSON.parse(line.slice('@@RESULT@@'.length));
}

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function aggregate(results) {
  const ok = results.filter((r) => r.stats);
  const first = results[0] ?? {};
  if (!ok.length) {
    const timeout = results.find((r) => r.timeout);
    const skipped = results.find((r) => r.skipped);
    const error = results.find((r) => r.error);
    return { status: timeout ? 'timeout' : skipped ? 'skipped' : 'error', timeout: timeout?.timeout, skipped: skipped?.skipped, error: error?.error };
  }
  const medians = ok.map((r) => r.stats.median);
  return {
    status: 'ok',
    runs: ok.length,
    median: median(medians),
    lo: Math.min(...medians),
    hi: Math.max(...medians),
    p95: median(ok.map((r) => r.stats.p95)),
    payloadBytes: first.payloadBytes,
    hashes: [...new Set(ok.map((r) => r.resultHash).filter(Boolean))],
    extra: first.extra,
  };
}

function verdict(base, head) {
  if (base.status === 'skipped' || head.status === 'skipped') {
    return { text: 'n/a', note: base.skipped ? `Baseline: ${base.skipped}` : `Ziel: ${head.skipped}` };
  }
  if (base.status === 'timeout' && head.status === 'ok') return { text: 'Baseline hängt', note: `Baseline > ${base.timeout} s` };
  if (head.status === 'timeout') return { text: 'Ziel hängt', note: `Ziel > ${head.timeout} s` };
  if (base.status !== 'ok' || head.status !== 'ok') return { text: 'Fehler', note: (base.error ?? head.error ?? '').split('\n')[0] };
  const delta = (head.median - base.median) / base.median;
  const separated = head.hi < base.lo || head.lo > base.hi;
  const real = Math.abs(delta) > THRESHOLD && separated;
  return {
    delta,
    text: !real ? 'Rauschen' : delta < 0 ? 'schneller' : 'langsamer',
  };
}

const fmtTime = (a) => {
  if (a.status === 'timeout') return `> ${a.timeout} s`;
  if (a.status !== 'ok') return '-';
  const ms = a.median;
  if (ms < 0.1) return `${(ms * 1000).toFixed(1)} µs`;
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};
const fmtPct = (d) => (d === undefined ? '' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} %`);
const kb = (n) => (n === undefined ? '-' : `${(n / 1024).toFixed(1)} KB`);

// ---------------------------------------------------------------------------
// bundle
// ---------------------------------------------------------------------------
function buildBundle(wt) {
  const vite = join(wt.dir, 'node_modules', 'vite', 'bin', 'vite.js');
  // vite directly: `npm run build` would run prebuild, which deletes the CSS
  const r = spawnSync(process.execPath, [vite, 'build'], { cwd: wt.dir, encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0) return { error: (r.stderr || r.stdout || '').slice(-400) };
  const dist = join(wt.dir, 'dist');
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const rel = relative(dist, p).replaceAll('\\', '/');
      const key = rel.replace(/-[A-Za-z0-9_-]{8}(?=\.[a-z]+$)/, '');
      const buf = readFileSync(p);
      files[key] = { raw: buf.length, gzip: gzipSync(buf).length };
    }
  };
  walk(dist);
  return { files };
}

function bundleTable(base, head) {
  if (base.error || head.error) return `Build fehlgeschlagen: ${base.error ?? head.error}`;
  const keys = [...new Set([...Object.keys(base.files), ...Object.keys(head.files)])];
  const size = (b, k, f) => b.files[k]?.[f];
  const rows = keys
    .map((k) => ({ k, b: size(base, k, 'raw'), h: size(head, k, 'raw'), bg: size(base, k, 'gzip'), hg: size(head, k, 'gzip') }))
    .filter((r) => /\.(js|css|html)$/.test(r.k))
    .sort((a, c) => Math.max(c.b ?? 0, c.h ?? 0) - Math.max(a.b ?? 0, a.h ?? 0));
  const total = (b, f) => Object.values(b.files).reduce((s, x) => s + x[f], 0);
  const line = (name, b, h, bg, hg) => {
    const d = b && h ? fmtPct((h - b) / b) : b ? 'entfällt' : 'neu';
    return `| ${name} | ${kb(b)} | ${kb(h)} | ${d} | ${kb(bg)} | ${kb(hg)} |`;
  };
  const out = ['| Datei | roh Baseline | roh Ziel | Δ roh | gzip Baseline | gzip Ziel |', '|---|---:|---:|---:|---:|---:|'];
  for (const r of rows.filter((x) => x.b !== x.h)) out.push(line(r.k, r.b, r.h, r.bg, r.hg));
  const same = rows.filter((x) => x.b === x.h).length;
  out.push(line('**Summe (alle Dateien)**', total(base, 'raw'), total(head, 'raw'), total(base, 'gzip'), total(head, 'gzip')));
  out.push('', `${same} weitere js/css/html-Dateien sind byte-identisch.`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const cases = listCases();
  log(`cases: ${cases.length}, runs per case: ${RUNS}`);
  const base = makeWorktree(args.base, 'base');
  const head = makeWorktree(args.head, 'head');
  const worktrees = [base, head];
  const raw = { base: {}, head: {} };
  const dead = { base: new Set(), head: new Set() }; // cases that timed out / failed: no more runs

  try {
    for (let run = 1; run <= RUNS; run++) {
      for (const name of cases) {
        for (const [key, wt] of [['base', base], ['head', head]]) {
          if (dead[key].has(name)) continue;
          const t0 = Date.now();
          const res = runCase(wt, name);
          (raw[key][name] ??= []).push(res);
          if (res.timeout || res.error || res.skipped) dead[key].add(name);
          log(`run ${run}/${RUNS} ${key.padEnd(4)} ${name.padEnd(32)} ${res.timeout ? `TIMEOUT ${res.timeout}s` : res.error ? 'ERROR' : res.skipped ? 'skipped' : `${res.stats.median.toFixed(3)} ms`} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        }
      }
    }

    let bundle = null;
    if (!args['skip-bundle']) {
      log('building bundles ...');
      bundle = { base: buildBundle(base), head: buildBundle(head) };
    }

    // ------------------------------------------------------------------ report
    const rows = cases.map((name) => {
      const b = aggregate(raw.base[name] ?? []);
      const h = aggregate(raw.head[name] ?? []);
      return { name, b, h, v: verdict(b, h) };
    });

    const md = [];
    md.push('# Performance: Vorher/Nachher', '');
    md.push(`- Baseline: \`${base.sha}\` ${base.subject}`);
    md.push(`- Ziel: \`${head.sha}\` ${head.subject}`);
    md.push(`- Node ${process.version}, ${cpus()[0]?.model.trim()} (${cpus().length} Threads), ${process.platform}`);
    md.push(`- ${RUNS} Prozessläufe je Fall, Wert = Median der Mediane; "echt" nur bei Abweichung > ${args.threshold} % **und** getrennten Min-Max-Spannen der Läufe, sonst "Rauschen".`);
    md.push('- Gemessen in Node mit fake-indexeddb, jsdom und chrome-Mock. Nicht enthalten: Script-Injektion, Offscreen-Dokument, Popup-Rendering, Netzwerk.', '');
    md.push('## Zeit', '', '| Fall | Baseline | Ziel | Δ | Urteil | Streuung B / Z |', '|---|---:|---:|---:|---|---|');
    const spread = (a) => (a.status === 'ok' && a.runs > 1 ? `${fmtTime({ ...a, median: a.lo })}–${fmtTime({ ...a, median: a.hi })}` : '');
    for (const r of rows) {
      md.push(`| ${r.name} | ${fmtTime(r.b)} | ${fmtTime(r.h)} | ${fmtPct(r.v.delta)} | ${r.v.text}${r.v.note ? ` (${r.v.note})` : ''} | ${spread(r.b)} / ${spread(r.h)} |`);
    }

    md.push('', '## Payload und Ergebnis-Gleichheit', '');
    md.push('| Fall | Payload Baseline | Payload Ziel | Ergebnis gleich? | Zusatz Baseline | Zusatz Ziel |', '|---|---:|---:|---|---|---|');
    for (const r of rows) {
      const hasPayload = r.b.payloadBytes !== undefined || r.h.payloadBytes !== undefined;
      const hasHash = r.b.hashes?.length || r.h.hashes?.length;
      const hasExtra = r.b.extra || r.h.extra;
      if (!hasPayload && !hasHash && !hasExtra) continue;
      const same = !hasHash ? '' : r.b.hashes?.join() === r.h.hashes?.join() ? 'ja' : 'NEIN';
      md.push(`| ${r.name} | ${kb(r.b.payloadBytes)} | ${kb(r.h.payloadBytes)} | ${same} | ${r.b.extra ? JSON.stringify(r.b.extra) : ''} | ${r.h.extra ? JSON.stringify(r.h.extra) : ''} |`);
    }

    if (bundle) md.push('', '## Bundle (dist/)', '', bundleTable(bundle.base, bundle.head));
    const report = md.join('\n');
    process.stdout.write(`${report}\n`);
    if (args.md) writeFileSync(resolve(args.md), `${report}\n`);
    if (args.json) {
      writeFileSync(resolve(args.json), JSON.stringify({ base: { sha: base.sha, subject: base.subject }, head: { sha: head.sha, subject: head.subject }, runs: RUNS, rows, raw, bundle }, null, 2));
    }
  } finally {
    if (!args.keep) for (const wt of worktrees) removeWorktree(wt);
    else log(`kept worktrees: ${base.dir}, ${head.dir}`);
  }
}

main().catch((error) => {
  log(error?.stack ?? String(error));
  process.exitCode = 1;
});
