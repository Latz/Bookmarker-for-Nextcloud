// Turn the content of one provider's price page into rows
// { prefix, input, output, source } -- dollars per million tokens, `prefix`
// being the model id (or the start of it) the way src/lib/aiPricing.js
// matches it. The extractors only read parsed data (tables, text, JSON), so
// they can be tested with small fixtures.
//
// A page that changes its layout makes an extractor return [] (or rows the
// checks in check.js flag); it must never return invented prices.

/**
 * "$1,250.50 / MTok" -> 1250.5; null if the cell holds no dollar amount.
 * @param {string | undefined} text
 * @returns {number | null}
 */
export function dollars(text) {
  const match = /\$\s*([\d,]*\.?\d+)/.exec(text ?? '');
  if (!match) return null;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * Anthropic: the first price table ("Base tokens") has one row per model,
 * "Claude Sonnet 5.5" + a description glued to it, then input and output.
 * @param {string[][][]} tables
 * @returns {Array<{prefix: string, input: number, output: number, source: string}>}
 */
export function extractAnthropic(tables) {
  const table = tables.find((rows) => rows[0]?.includes('Base tokens'));
  if (!table) return [];
  const rows = [];
  for (const cells of table) {
    const name = /^Claude ([A-Z][a-z]+) (\d+(?:\.\d+)?)/.exec(cells[0] ?? '');
    const input = dollars(cells[1]);
    const output = dollars(cells[2]);
    if (!name || input === null || output === null) continue;
    const [, family, version] = name;
    const dashed = version.replace('.', '-');
    // Models before Claude 4 are named "claude-3-5-haiku", later ones
    // "claude-haiku-4-5".
    const prefix =
      Number.parseInt(version, 10) < 4
        ? `claude-${dashed}-${family.toLowerCase()}`
        : `claude-${family.toLowerCase()}-${dashed}`;
    rows.push({ prefix, input, output, source: 'anthropic' });
  }
  return rows;
}

/**
 * OpenAI: the first table of the pricing page is "Standard"; columns are
 * Model, Input, Cached input, Cache writes, Output (short context), then the
 * same for long context.
 * @param {string[][][]} tables
 * @returns {Array<{prefix: string, input: number, output: number, source: string}>}
 */
export function extractOpenAI(tables) {
  const table = tables.find((rows) => rows[0]?.includes('Short context'));
  if (!table) return [];
  const rows = [];
  for (const cells of table) {
    const id = cells[0]?.trim();
    const input = dollars(cells[1]);
    const output = dollars(cells[4]);
    if (!id || !/^[a-z][a-z0-9.\-]*$/.test(id)) continue;
    if (input === null || output === null) continue;
    rows.push({ prefix: id, input, output, source: 'openai' });
  }
  return rows;
}

/**
 * Google: each model has a section with its id in a code element followed by
 * a table "Paid Tier" with "Input price" / "Output price" rows whose paid cell
 * starts with the (lowest-tier) dollar amount.
 * @param {Document} document
 * @returns {Array<{prefix: string, input: number, output: number, source: string}>}
 */
export function extractGoogle(document) {
  const rows = [];
  let model = null;
  const nodes = document.querySelectorAll('code, table');
  for (const node of nodes) {
    if (node.tagName === 'CODE') {
      const id = node.textContent.trim();
      if (/^gemini-[a-z0-9][a-z0-9.\-]*$/.test(id)) {
        model = NOT_A_CHAT_MODEL.test(id) ? null : id;
      }
      continue;
    }
    if (!model) continue;
    let input = null;
    let output = null;
    for (const row of node.querySelectorAll('tr')) {
      const cells = Array.from(row.querySelectorAll('th, td')).map((cell) =>
        cell.textContent.replace(/\s+/g, ' ').trim(),
      );
      const paid = cells.at(-1);
      if (/^input price/i.test(cells[0] ?? '') && input === null) {
        input = dollars(paid);
      } else if (/^output price/i.test(cells[0] ?? '') && output === null) {
        output = dollars(paid);
      }
    }
    if (input !== null && output !== null) {
      // the first price table after the model's heading is its standard one
      if (!rows.some((row) => row.prefix === model)) {
        rows.push({ prefix: model, input, output, source: 'google' });
      }
      model = null;
    }
  }
  return rows;
}

/**
 * DeepSeek: one table with a column per model; the price rows are labelled
 * "1M INPUT TOKENS(CACHE MISS)" and "1M OUTPUT TOKENS" and come in an
 * OFF-PEAK and a PEAK row. The PEAK price is taken (the higher, so an
 * estimate does not come out too low).
 * @param {string[][][]} tables
 * @returns {Array<{prefix: string, input: number, output: number, source: string}>}
 */
export function extractDeepSeek(tables) {
  const table = tables.find((rows) => rows[0]?.[0] === 'MODEL');
  if (!table) return [];
  const names = table[0].slice(1).map((name) =>
    name
      .replace(/\(\d+\)$/, '')
      .trim()
      .toLowerCase(),
  );
  let section = '';
  const prices = { input: [], output: [] };
  for (const cells of table) {
    const label = cells.find((cell) => /1M (INPUT|OUTPUT)/.test(cell));
    if (label) {
      section = /CACHE MISS/.test(label)
        ? 'input'
        : /OUTPUT/.test(label)
          ? 'output'
          : '';
    }
    if (section && cells.some((cell) => cell.trim() === 'PEAK')) {
      const amounts = cells.map((cell) => dollars(cell)).filter(Boolean);
      prices[section] = amounts.slice(-names.length);
    }
  }
  return names.flatMap((prefix, index) => {
    const input = prices.input[index];
    const output = prices.output[index];
    return input > 0 && output > 0
      ? [{ prefix, input, output, source: 'deepseek' }]
      : [];
  });
}

// Models that are not priced per text token like a chat model (their "output"
// price is per image, per second of audio, ...) or are not chat models.
const NOT_A_CHAT_MODEL =
  /(image|audio|realtime|tts|transcribe|translate|embed|moderation|search|live|robotics|computer-use|customtools)/;

// Vendors whose OpenRouter price is the vendor's own (OpenRouter passes the
// list price through). Other models there cost what the cheapest host charges.
const OPENROUTER_VENDORS = new Set(['openai', 'anthropic', 'google']);
const OPENROUTER_SKIP = /(free|extended|online|:)/;

/**
 * OpenRouter: /api/v1/models lists prices per token. Used to cross-check the
 * pages (and as a fallback), never as the source for other hosts' models.
 * @param {{data?: Array<{id: string, pricing?: {prompt?: string, completion?: string}}>}} json
 * @returns {Array<{prefix: string, input: number, output: number, source: string}>}
 */
export function extractOpenRouter(json) {
  const rows = [];
  for (const model of json?.data ?? []) {
    const [vendor, name] = String(model.id).split('/');
    if (!OPENROUTER_VENDORS.has(vendor) || !name) continue;
    if (OPENROUTER_SKIP.test(name) || NOT_A_CHAT_MODEL.test(name)) continue;
    const perMillion = (value) => {
      const number = Number(value) * 1e6;
      return Number.isFinite(number) && number > 0
        ? Number(number.toPrecision(6))
        : null;
    };
    const input = perMillion(model.pricing?.prompt);
    const output = perMillion(model.pricing?.completion);
    if (input === null || output === null) continue;
    // Anthropic ids use dashes ("claude-haiku-4-5"), OpenRouter dots
    const prefix = vendor === 'anthropic' ? name.replaceAll('.', '-') : name;
    rows.push({ prefix, input, output, source: 'openrouter' });
  }
  return rows;
}
