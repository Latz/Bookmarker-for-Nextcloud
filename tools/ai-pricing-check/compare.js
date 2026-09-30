// Compares the prices found on the pages with the list in
// src/lib/aiPricing.js, and writes the list back. No network, no files: the
// tests run it with small fixtures.

// A price that changes by more than this factor is more likely a misread page
// than a real price change.
const SUSPICIOUS_FACTOR = 10;

/**
 * Compares the prices found with the current list.
 * @param {Awaited<ReturnType<typeof readSource>>[]} sources
 * @param {Array<[string, number, number]>} current
 */
export function compare(sources, current) {
  const currentMap = new Map(
    current.map(([p, i, o]) => [p, { input: i, output: o }]),
  );
  const official = new Map();
  const router = new Map();
  for (const source of sources) {
    if (source.error) continue;
    for (const row of source.rows) {
      const target = source.official ? official : router;
      if (!target.has(row.prefix)) target.set(row.prefix, row);
    }
  }

  const same = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.001; // 0.1%
  const report = {
    changed: [],
    added: [],
    unchanged: [],
    conflicts: [],
    missing: [],
  };

  const consider = (row, kind) => {
    const old = currentMap.get(row.prefix);
    if (!old) {
      report.added.push({ ...row, kind });
    } else if (same(old.input, row.input) && same(old.output, row.output)) {
      report.unchanged.push({ ...row, kind });
    } else {
      const factor = Math.max(
        row.input / old.input,
        old.input / row.input,
        row.output / old.output,
        old.output / row.output,
      );
      report.changed.push({
        ...row,
        kind,
        old,
        suspicious: factor > SUSPICIOUS_FACTOR,
      });
    }
  };

  for (const row of official.values()) {
    consider(row, 'official');
    // cross-check against OpenRouter
    const other = router.get(row.prefix);
    if (
      other &&
      !(same(other.input, row.input) && same(other.output, row.output))
    ) {
      report.conflicts.push({
        prefix: row.prefix,
        official: row,
        openrouter: other,
      });
    }
  }
  // OpenRouter only fills in models the pages did not list, and only ones
  // that are already in the list (it lists far more models than we track)
  for (const row of router.values()) {
    if (!official.has(row.prefix) && currentMap.has(row.prefix)) {
      consider(row, 'openrouter');
    }
  }
  const seen = new Set([...official.keys(), ...router.keys()]);
  for (const [prefix] of current) {
    if (!seen.has(prefix)) report.missing.push(prefix);
  }
  return report;
}

/**
 * Text of the price block for src/lib/aiPricing.js.
 * @param {Array<[string, number, number]>} entries
 * @returns {string}
 */
export function renderBlock(entries) {
  const vendorOf = (prefix) => {
    if (prefix.startsWith('claude')) return 'Anthropic';
    if (/^(gpt-|chatgpt-|o\d)/.test(prefix)) return 'OpenAI';
    if (prefix.startsWith('gemini')) return 'Google';
    if (prefix.startsWith('mistral')) return 'Mistral';
    if (prefix.startsWith('deepseek')) return 'DeepSeek';
    return 'Others';
  };
  const order = [
    'Anthropic',
    'OpenAI',
    'Google',
    'Mistral',
    'DeepSeek',
    'Others',
  ];
  const groups = Object.fromEntries(order.map((name) => [name, []]));
  for (const entry of entries) groups[vendorOf(entry[0])].push(entry);
  const lines = [];
  for (const name of order) {
    if (groups[name].length === 0) continue;
    lines.push(`  // ${name}`);
    for (const [prefix, input, output] of groups[name].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      lines.push(`  ['${prefix}', ${input}, ${output}],`);
    }
  }
  return lines.join('\n');
}

/**
 * Replaces the marked block in the source of aiPricing.js.
 * @param {string} source
 * @param {string} block
 * @returns {string}
 */
export function replaceBlock(source, block) {
  const pattern =
    /(\/\/ <prices:begin>\r?\n)[\s\S]*?(\r?\n\s*\/\/ <prices:end>)/;
  if (!pattern.test(source)) {
    throw new Error('prices:begin / prices:end markers not found');
  }
  // keep the file's own line endings (CRLF in Windows checkouts)
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(
    pattern,
    (_, begin, end) => `${begin}${block.replaceAll('\n', eol)}${end}`,
  );
}
