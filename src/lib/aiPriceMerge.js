// Compares the prices read from the providers' pages with the price list, and
// collects the model details. Pure; used by the pricing checker and by the
// extension (src/background/modules/ai/priceUpdate.js).

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
  // OpenRouter fills in the models the official pages do not list (the
  // OpenAI page, for one, only names the newest models). Its rows are
  // restricted to the vendors it is trusted for (extractOpenRouter).
  for (const row of router.values()) {
    if (!official.has(row.prefix)) consider(row, 'openrouter');
  }
  const seen = new Set([...official.keys(), ...router.keys()]);
  for (const [prefix] of current) {
    if (!seen.has(prefix)) report.missing.push(prefix);
  }
  return report;
}

/**
 * The details of the models (context window, release date, ...) the pages and
 * OpenRouter gave, for the models of the price list. Official pages win over
 * OpenRouter where both know a detail.
 * @param {Array<{official: boolean, error?: string, rows: Array<any>}>} sources
 * @param {Set<string>} prefixes - The models of the price list.
 * @returns {Record<string, Record<string, unknown>>}
 */
export function collectInfo(sources, prefixes) {
  const usable = sources.filter((source) => !source.error);
  // OpenRouter first, so that what the official pages say overrides it
  const ordered = [
    ...usable.filter((source) => !source.official),
    ...usable.filter((source) => source.official),
  ];
  /** @type {Record<string, Record<string, unknown>>} */
  const info = {};
  for (const source of ordered) {
    for (const row of source.rows) {
      if (!row.info || !prefixes.has(row.prefix)) continue;
      info[row.prefix] = { ...info[row.prefix], ...row.info };
    }
  }
  return info;
}
