// Used by the pricing checker (tools/ai-pricing-check) and by the extension
// itself, which reads the same pages when the prices are updated.
//
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
 * "131,072" -> 131072, "1M" -> 1000000, "MAXIMUM: 384K" -> 384000; null if
 * the text holds no number.
 * @param {string | undefined | null} text
 * @returns {number | null}
 */
export function parseTokenCount(text) {
  const match = /([\d,.]+)\s*([KkMm])?/.exec(text ?? '');
  if (!match) return null;
  const number = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(number) || number <= 0) return null;
  const factor = { k: 1e3, m: 1e6 }[(match[2] ?? '').toLowerCase()] ?? 1;
  return Math.round(number * factor);
}

/**
 * Drops the entries of an object that hold no value.
 * @param {Record<string, any>} object
 * @returns {Record<string, any>}
 */
function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value != null && value !== ''),
  );
}

/**
 * The first sentence of a (Markdown) description, without links and
 * emphasis, at most 200 characters.
 * @param {unknown} text
 * @returns {string}
 */
export function firstSentence(text) {
  const plain = String(text ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|`/g, '')
    .replace(/\uFFFD/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = /^(.{20,}?[.!?])(\s|$)/.exec(plain)?.[1] ?? plain;
  return sentence.length > 200
    ? `${sentence.slice(0, 197).trimEnd()}...`
    : sentence;
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
    rows.push({
      prefix,
      input,
      output,
      source: 'anthropic',
      info: compact({ cachedInput: dollars(cells[5]) }),
    });
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
    rows.push({
      prefix: id,
      input,
      output,
      source: 'openai',
      info: compact({ cachedInput: dollars(cells[2]) }),
    });
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
export function extractDeepSeek(tables, text = '') {
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
  // A row of the table: one value for all models, or one each
  const cell = (label, index) => {
    const row = table.find((cells) => cells[0]?.trim() === label);
    const values = row?.slice(1) ?? [];
    return values[values.length === 1 ? 0 : index];
  };
  const rows = names.flatMap((prefix, index) => {
    const input = prices.input[index];
    const output = prices.output[index];
    if (!(input > 0 && output > 0)) return [];
    // The page has no description; its "model version" and "thinking mode"
    // rows say what the model is.
    const version = cell('MODEL VERSION', index)?.trim();
    const thinking = cell('THINKING MODE', index)?.split('See ')[0].trim();
    return [
      {
        prefix,
        input,
        output,
        source: 'deepseek',
        info: compact({
          context: parseTokenCount(cell('CONTEXT LENGTH', index)),
          maxOutput: parseTokenCount(cell('MAX OUTPUT', index)),
          description: version && thinking ? `${version}: ${thinking}.` : '',
        }),
        version: version?.toLowerCase(),
      },
    ];
  });

  // A footnote names old model names that are still accepted and billed like
  // the current model they are served by ("... served by the DeepSeek-V4.1-Flash
  // model and billed at the Flash price"): they get its price and details.
  const legacy =
    /legacy names? (.+?) (?:is|are) still accepted.*?served by the ([A-Za-z0-9.\-]+) model/i.exec(
      text,
    );
  if (legacy) {
    const target = rows.find((row) => row.version === legacy[2].toLowerCase());
    if (target) {
      for (const name of legacy[1].split(/,| and /)) {
        const alias = name.trim().toLowerCase();
        if (/^deepseek-[a-z0-9.\-]+$/.test(alias)) {
          rows.push({ ...target, prefix: alias });
        }
      }
    }
  }
  return rows.map(({ version, ...row }) => row);
}

/**
 * Groq: the models table of the console docs. The first cell of a row holds
 * the model id as the `id` attribute of an element, the price cell reads
 * "$0.15 input$0.60 output". Models without a public price ("Contact Sales",
 * e.g. the Llama models) and models priced per hour or per character are
 * skipped.
 * @param {Document} document
 * @returns {Array<{prefix: string, input: number, output: number, source: string}>}
 */
export function extractGroq(document) {
  const rows = [];
  for (const table of document.querySelectorAll('table')) {
    const header = table.querySelector('tr')?.textContent ?? '';
    if (!/PRICE PER\s+1M\s+TOKENS/i.test(header)) continue;
    for (const tr of table.querySelectorAll('tr')) {
      const cells = tr.children; // the model may be a th (row header)
      const id = cells[0]?.querySelector('[id]')?.id;
      const price = /\$([\d.]+)\s*input\s*\$([\d.]+)\s*output/i.exec(
        cells[2]?.textContent ?? '',
      );
      if (!id || !price) continue;
      // "openai/gpt-oss-120b" is matched as "gpt-oss-120b", like aiPricing does
      const prefix = id.replace(/^.*\//, '').toLowerCase();
      if (NOT_A_CHAT_MODEL.test(prefix)) continue;
      rows.push({
        prefix,
        input: Number(price[1]),
        output: Number(price[2]),
        source: 'groq',
        info: compact({
          speed: parseTokenCount(cells[1]?.textContent),
          context: parseTokenCount(cells[4]?.textContent),
          maxOutput: parseTokenCount(cells[5]?.textContent),
        }),
      });
    }
  }
  return rows;
}

/**
 * Mistral: the pricing page of the docs (docs.mistral.ai/inference/pricing) has
 * tables "Model | Input | Cached input | Output" with the current models and
 * dollars per million tokens. Models are named by size in the price list, the
 * way Mistral's "-latest" names are ("Mistral Small 4" is `mistral-small`,
 * "Ministral 3 14B" is `ministral-14b`, "Codestral" is `codestral`). Rows with
 * other units (pages, minutes, characters), embeddings, OCR, speech,
 * moderation and models of other makers are skipped.
 * @param {string[][][]} tables
 * @returns {Array<{prefix: string, input: number, output: number, source: string, info: Record<string, any>}>}
 */
export function extractMistral(tables) {
  const rows = [];
  for (const table of tables) {
    if (table[0]?.join('|') !== 'Model|Input|Cached input|Output') continue;
    for (const cells of table.slice(1)) {
      const name = (cells[0] ?? '').replace('\u2197', '').trim();
      const plain = (cell) => /^\$[\d.]+$/.test((cell ?? '').trim());
      if (!plain(cells[1]) || !plain(cells[3])) continue;
      let prefix = null;
      const size = /^Mistral (Large|Medium|Small)\b/i.exec(name);
      const ministral = /^Ministral \d+ (\d+B)$/i.exec(name);
      if (size) prefix = `mistral-${size[1].toLowerCase()}`;
      else if (ministral) prefix = `ministral-${ministral[1].toLowerCase()}`;
      else if (/^Codestral$/i.test(name)) prefix = 'codestral';
      if (!prefix) continue;
      rows.push({
        prefix,
        input: dollars(cells[1]),
        output: dollars(cells[3]),
        source: 'mistral',
        info: compact({
          cachedInput: plain(cells[2]) ? dollars(cells[2]) : null,
        }),
      });
    }
  }
  return rows;
}

// Models that are not priced per text token like a chat model (their "output"
// price is per image, per second of audio, ...) or are not chat models.
const NOT_A_CHAT_MODEL =
  /(image|audio|realtime|tts|transcribe|translate|embed|moderation|search|live|robotics|computer-use|customtools|guard|whisper|orpheus)/;

// Vendors whose OpenRouter price is the vendor's own (OpenRouter passes the
// list price through). Other models there cost what the cheapest host charges.
const OPENROUTER_VENDORS = new Set(['openai', 'anthropic', 'google']);
const MISTRAL_FAMILIES = [
  'mistral-large',
  'mistral-medium',
  'mistral-small',
  'ministral-14b',
  'ministral-8b',
  'ministral-3b',
  'codestral',
];

// gpt-oss and the like are open weights, hosted (and priced) by many providers
const OPENROUTER_SKIP = /(free|extended|online|:|^gpt-oss)/;

/**
 * OpenRouter: /api/v1/models lists prices per token. Used to cross-check the
 * pages (and as a fallback), never as the source for other hosts' models.
 * @param {{data?: Array<{id: string, pricing?: {prompt?: string, completion?: string}}>}} json
 * @returns {Array<{prefix: string, input: number, output: number, source: string}>}
 */
export function extractOpenRouter(json) {
  const rows = [];
  const perMillion = (value) => {
    const number = Number(value) * 1e6;
    return Number.isFinite(number) && number > 0
      ? Number(number.toPrecision(6))
      : null;
  };
  /** The row of one OpenRouter model, under the given name of the list. */
  const rowOf = (model, prefix) => {
    const input = perMillion(model.pricing?.prompt);
    const output = perMillion(model.pricing?.completion);
    if (input === null || output === null) return null;
    const created = Number(model.created);
    return {
      prefix,
      input,
      output,
      source: 'openrouter',
      info: compact({
        context: model.context_length,
        maxOutput: model.top_provider?.max_completion_tokens,
        released:
          Number.isFinite(created) && created > 0
            ? new Date(created * 1000).toISOString().slice(0, 10)
            : null,
        modalities: model.architecture?.input_modalities?.join(', '),
        description: firstSentence(model.description),
      }),
    };
  };

  for (const model of json?.data ?? []) {
    const [vendor, name] = String(model.id).split('/');
    if (!OPENROUTER_VENDORS.has(vendor) || !name) continue;
    if (OPENROUTER_SKIP.test(name) || NOT_A_CHAT_MODEL.test(name)) continue;
    // Anthropic ids use dashes ("claude-haiku-4-5"), OpenRouter dots
    const prefix = vendor === 'anthropic' ? name.replaceAll('.', '-') : name;
    const row = rowOf(model, prefix);
    if (row) rows.push(row);
  }

  // Mistral names its models by size ("mistral-small") and moves the name to
  // the newest version, while OpenRouter lists every version separately
  // ("mistral-small-2603", "mistral-small-3.2-24b-instruct", ...): the newest
  // one of a size stands for the name. Its price is Mistral's own (checked:
  // Mistral Large is $0.5 / $1.5 on both).
  for (const family of MISTRAL_FAMILIES) {
    const newest = (json?.data ?? [])
      .filter((model) => {
        const [vendor, name = ''] = String(model.id).split('/');
        return (
          vendor === 'mistralai' &&
          name.startsWith(family) &&
          !name.includes(':')
        );
      })
      .sort((a, b) => Number(b.created) - Number(a.created))[0];
    const row = newest && rowOf(newest, family);
    if (row) rows.push(row);
  }
  return rows;
}
