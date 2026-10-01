// @vitest-environment happy-dom
/**
 * Unit tests for tools/ai-pricing-check: the extractors (fixtures shaped like
 * the real price pages) and the comparison / rewriting of src/lib/aiPricing.js.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  dollars,
  extractAnthropic,
  extractDeepSeek,
  extractGoogle,
  extractGroq,
  extractMistral,
  extractOpenAI,
  extractOpenRouter,
  firstSentence,
  parseTokenCount,
} from '../../src/lib/aiPriceExtractors.js';
import { collectInfo, compare } from '../../src/lib/aiPriceMerge.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('dollars', () => {
  it('reads the first dollar amount of a cell', () => {
    expect(dollars('$10 / MTok')).toBe(10);
    expect(dollars('$1,250.50')).toBe(1250.5);
    expect(dollars('$0.10 (text / image / video)$0.30 (audio)')).toBe(0.1);
  });

  it('returns null without an amount', () => {
    expect(dollars('Free of charge')).toBeNull();
    expect(dollars(undefined)).toBeNull();
  });
});

describe('extractAnthropic', () => {
  const table = [
    ['Model', 'Base tokens', 'Prompt caching'],
    ['Name', 'Input', 'Output'],
    ['Claude Sonnet 5.5The best combination', '$2 / MTok', '$10 / MTok'],
    ['Claude Haiku 4.5The fastest model', '$1 / MTok', '$5 / MTok'],
    ['Additional models'],
    ['Claude Mythos 5.1', '$10 / MTok', '$50 / MTok'],
    ['Claude Opus 4.1', '$15 / MTok', '$75 / MTok'],
    ['Claude Haiku 3.5', '$0.80 / MTok', '$4 / MTok'],
  ];

  it('turns the model names into ids and reads input and output', () => {
    expect(
      extractAnthropic([table]).map((r) => [r.prefix, r.input, r.output]),
    ).toEqual([
      ['claude-sonnet-5-5', 2, 10],
      ['claude-haiku-4-5', 1, 5],
      ['claude-mythos-5-1', 10, 50],
      ['claude-opus-4-1', 15, 75],
      ['claude-3-5-haiku', 0.8, 4],
    ]);
  });

  it('uses only the standard table, and finds nothing on another layout', () => {
    const batch = [['Model', 'Batch tokens'], ...table.slice(1)];
    expect(extractAnthropic([batch])).toEqual([]);
    expect(extractAnthropic([])).toEqual([]);
  });
});

describe('extractOpenAI', () => {
  it('reads the standard table: input and output of the short context', () => {
    const tables = [
      [
        ['', 'Short context', 'Long context'],
        ['Model', 'Input', 'Cached input', 'Cache writes', 'Output'],
        ['gpt-6.1-sol', '$2.00', '$0.10', '$2.50', '$10.00', '$4.00'],
        ['gpt-6-luna', '$0.10', '$0.01', '$0.125', '$0.50'],
      ],
    ];
    expect(extractOpenAI(tables)).toEqual([
      {
        prefix: 'gpt-6.1-sol',
        input: 2,
        output: 10,
        source: 'openai',
        info: { cachedInput: 0.1 },
      },
      {
        prefix: 'gpt-6-luna',
        input: 0.1,
        output: 0.5,
        source: 'openai',
        info: { cachedInput: 0.01 },
      },
    ]);
  });
});

describe('extractGoogle', () => {
  const section = (id, input, output) => `
    <h3>${id}</h3><code>${id}</code>
    <table>
      <tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr>
      <tr><td>Input price (text, image, video)</td><td>Free of charge</td><td>${input}</td></tr>
      <tr><td>Output price (including thinking tokens)</td><td>Free of charge</td><td>${output}</td></tr>
    </table>`;

  it('assigns the price table to the model id in front of it', () => {
    document.body.innerHTML =
      section('gemini-2.5-flash-lite', '$0.10 (text)$0.30 (audio)', '$0.40') +
      section('gemini-2.5-pro', '$1.25, prompts &lt;= 200k$2.50', '$10.00');

    expect(
      extractGoogle(document).map((r) => [r.prefix, r.input, r.output]),
    ).toEqual([
      ['gemini-2.5-flash-lite', 0.1, 0.4],
      ['gemini-2.5-pro', 1.25, 10],
    ]);
  });

  it('skips image, audio and other non-chat models', () => {
    document.body.innerHTML =
      section('gemini-2.5-flash-image', '$0.30', '$0.039') +
      section('gemini-3.1-flash-tts-preview', '$1', '$20') +
      section('gemini-2.5-flash', '$0.30', '$2.50');

    expect(extractGoogle(document).map((r) => r.prefix)).toEqual([
      'gemini-2.5-flash',
    ]);
  });
});

describe('extractGroq', () => {
  const row = (id, name, price) => `
    <tr>
      <td><div><div id="${id}"><a>${name}</a></div><span>${id}</span></div></td>
      <td>500</td>
      <td>${price}</td>
    </tr>`;
  const table = (rows, header = 'PRICE PER\n1M TOKENS') => `
    <table><tr><th>MODEL ID</th><th>SPEED</th><th>${header}</th></tr>${rows}</table>`;

  it('reads the model id from the id attribute and the input and output price', () => {
    document.body.innerHTML = table(
      row('openai/gpt-oss-120b', 'GPT OSS 120B', '$0.15 input$0.60 output') +
        row('qwen3.8-27b', 'Qwen3.8 27B', '$0.80 input$4.00 output'),
    );

    expect(
      extractGroq(document).map((r) => [r.prefix, r.input, r.output, r.source]),
    ).toEqual([
      ['gpt-oss-120b', 0.15, 0.6, 'groq'],
      ['qwen3.8-27b', 0.8, 4, 'groq'],
    ]);
  });

  it('skips models without a public price and those not priced per token', () => {
    document.body.innerHTML = table(
      row('llama-3.3-70b-versatile', 'Llama 3.3 70B', 'ContactSales') +
        row('whisper-large-v3', 'Whisper', '$0.111 per hour') +
        row(
          'meta-llama/llama-prompt-guard-2-22m',
          'Guard',
          '$0.03 input$0.03 output',
        ) +
        row('openai/gpt-oss-20b', 'GPT OSS 20B', '$0.075 input$0.30 output'),
    );

    expect(extractGroq(document).map((r) => r.prefix)).toEqual(['gpt-oss-20b']);
  });

  it('ignores tables that are not a price list', () => {
    document.body.innerHTML = table(
      row('openai/gpt-oss-120b', 'GPT OSS 120B', '$0.15 input$0.60 output'),
      'RATE LIMITS',
    );
    expect(extractGroq(document)).toEqual([]);
  });
});

describe('extractMistral', () => {
  const header = ['Model', 'Input', 'Cached input', 'Output'];
  const chat = [
    header,
    ['Mistral Large 3 \u2197', '$0.5', '$0.05', '$1.5'],
    ['Mistral Medium 3.5 \u2197', '$1.5', '$0.15', '$7.5'],
    ['Mistral Small 4 \u2197', '$0.15', '$0.015', '$0.6'],
    ['Ministral 3 14B \u2197', '$0.2', '$0.02', '$0.2'],
    ['Ministral 3 3B \u2197', '$0.1', '$0.01', '$0.1'],
  ];

  it('names the models by size, as the price list does, with prices and cached input', () => {
    expect(
      extractMistral([chat]).map((r) => [
        r.prefix,
        r.input,
        r.output,
        r.info.cachedInput,
      ]),
    ).toEqual([
      ['mistral-large', 0.5, 1.5, 0.05],
      ['mistral-medium', 1.5, 7.5, 0.15],
      ['mistral-small', 0.15, 0.6, 0.015],
      ['ministral-14b', 0.2, 0.2, 0.02],
      ['ministral-3b', 0.1, 0.1, 0.01],
    ]);
    expect(extractMistral([chat])[0].source).toBe('mistral');
  });

  it('reads Codestral from any of the tables', () => {
    const rows = extractMistral([
      chat,
      [header, ['Codestral \u2197', '$0.3', '$0.03', '$0.9']],
    ]);
    expect(rows.at(-1)).toMatchObject({
      prefix: 'codestral',
      input: 0.3,
      output: 0.9,
    });
  });

  it('skips other units, embeddings, speech, moderation and other makers', () => {
    const rows = extractMistral([
      [
        header,
        ['OCR 4.1 \u2197', '$4 /1000 Pages', '$0.4 /1000 Pages', '\u2014'],
        ['Voxtral TTS \u2197', '$0 /M Chars', '$0 /M Chars', '$16 /M Chars'],
        ['Mistral Moderation 2 \u2197', 'Free', 'Free', 'Free'],
        ['Codestral Embed \u2197', '$0.15', '$0.015', '\u2014'],
        ['Z.ai GLM 5.3 \u2197', '$1.4', '$0.14', '$4.4'],
      ],
    ]);
    expect(rows).toEqual([]);
  });

  it('finds nothing when the tables look different (page changed)', () => {
    expect(extractMistral([])).toEqual([]);
    expect(
      extractMistral([
        [
          ['Name', 'Price'],
          ['x', '$1'],
        ],
      ]),
    ).toEqual([]);
  });
});

describe('model details', () => {
  it('parseTokenCount reads plain, grouped and K/M numbers', () => {
    expect(parseTokenCount('131,072')).toBe(131072);
    expect(parseTokenCount('1M')).toBe(1000000);
    expect(parseTokenCount('MAXIMUM: 384K')).toBe(384000);
    expect(parseTokenCount('1.5M tokens')).toBe(1500000);
    expect(parseTokenCount('-')).toBeNull();
    expect(parseTokenCount(undefined)).toBeNull();
  });

  it('firstSentence strips links and emphasis and keeps one sentence', () => {
    expect(
      firstSentence(
        'GPT-5 Mini is a **compact** [version](https://x.test) of GPT-5. It is fast. More text.',
      ),
    ).toBe('GPT-5 Mini is a compact version of GPT-5.');
  });

  it('firstSentence cuts a very long sentence', () => {
    const long = `${'word '.repeat(80)}end.`;
    const result = firstSentence(long);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('...')).toBe(true);
  });

  it('Anthropic rows carry the cache hit price', () => {
    const rows = extractAnthropic([
      [
        ['Model', 'Base tokens', 'Prompt caching'],
        [
          'Name',
          'Input',
          'Output',
          '5m writes',
          '1h writes',
          'Hits and refreshes',
        ],
        [
          'Claude Haiku 4.5The fastest',
          '$1 / MTok',
          '$5 / MTok',
          '$1.25 / MTok',
          '$2 / MTok',
          '$0.10 / MTok',
        ],
      ],
    ]);
    expect(rows[0].info).toEqual({ cachedInput: 0.1 });
  });

  it('Groq rows carry speed, context window and the largest answer', () => {
    document.body.innerHTML = `<table>
      <tr><th>MODEL ID</th><th>SPEED</th><th>PRICE PER\n1M TOKENS</th><th>LIMITS</th><th>CONTEXT</th><th>MAX</th></tr>
      <tr><td><div id="openai/gpt-oss-120b">GPT OSS</div></td><td>500</td><td>$0.15 input$0.60 output</td><td>250K TPM</td><td>131,072</td><td>65,536</td></tr>
    </table>`;
    expect(extractGroq(document)[0].info).toEqual({
      speed: 500,
      context: 131072,
      maxOutput: 65536,
    });
  });

  it('OpenRouter rows carry context, release date, input types and description', () => {
    const rows = extractOpenRouter({
      data: [
        {
          id: 'openai/gpt-5-mini',
          created: 1754524800,
          context_length: 400000,
          top_provider: { max_completion_tokens: 128000 },
          architecture: { input_modalities: ['text', 'image'] },
          description: 'A compact model for lighter tasks. Second sentence.',
          pricing: { prompt: '0.00000025', completion: '0.000002' },
        },
      ],
    });
    expect(rows[0].info).toEqual({
      context: 400000,
      maxOutput: 128000,
      released: '2025-08-07',
      modalities: 'text, image',
      description: 'A compact model for lighter tasks.',
    });
  });

  describe('collectInfo', () => {
    const source = (official, rows, error) => ({ official, error, rows });
    const prefixes = new Set(['a', 'b']);

    it('lets the official pages override OpenRouter, detail by detail', () => {
      const info = collectInfo(
        [
          source(true, [
            { prefix: 'a', info: { context: 1, cachedInput: 0.1 } },
          ]),
          source(false, [
            { prefix: 'a', info: { context: 9, released: '2025-01-01' } },
          ]),
        ],
        prefixes,
      );
      expect(info.a).toEqual({
        context: 1,
        cachedInput: 0.1,
        released: '2025-01-01',
      });
    });

    it('keeps only models of the price list and ignores failed sources', () => {
      const info = collectInfo(
        [
          source(true, [{ prefix: 'zzz', info: { context: 1 } }]),
          source(true, [{ prefix: 'b', info: { context: 2 } }], 'HTTP 500'),
        ],
        prefixes,
      );
      expect(info).toEqual({});
    });
  });
});

describe('DeepSeek: description and legacy names', () => {
  const table = [
    ['MODEL', 'deepseek-flash(1)', 'deepseek-v4-pro'],
    ['MODEL VERSION', 'DeepSeek-V4.1-Flash', 'DeepSeek-V4-Pro-0813'],
    [
      'THINKING MODE',
      'Supports both non-thinking and thinking (default) modesSee Thinking Mode for how to switch',
    ],
    ['CONTEXT LENGTH', '1M'],
    ['1M INPUT TOKENS(CACHE MISS)', 'OFF-PEAK', '$0.15', '$0.66'],
    ['PEAK', '$0.3', '$1.32'],
    ['1M OUTPUT TOKENS', 'OFF-PEAK', '$0.6', '$1.98'],
    ['PEAK', '$1.2', '$3.96'],
  ];
  const footnote =
    '(1) Use deepseek-flash as the model name. The legacy names deepseek-v4-flash and deepseek-v4-flash-vision-exp are still accepted, but the corresponding models have been retired, their requests are served by the DeepSeek-V4.1-Flash model and billed at the Flash price.(2) Off-peak rates';

  it('describes a model by its version and thinking mode', () => {
    const rows = extractDeepSeek([table]);
    expect(rows[0].info.description).toBe(
      'DeepSeek-V4.1-Flash: Supports both non-thinking and thinking (default) modes.',
    );
    expect(rows[1].info.description).toContain('DeepSeek-V4-Pro-0813');
    expect(rows[0]).not.toHaveProperty('version');
  });

  it('gives the legacy names that are still accepted the price and details of their model', () => {
    const rows = extractDeepSeek([table], footnote);
    const flash = rows.find((r) => r.prefix === 'deepseek-flash');

    expect(rows.map((r) => r.prefix)).toEqual([
      'deepseek-flash',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v4-flash-vision-exp',
    ]);
    for (const alias of rows.slice(2)) {
      expect(alias).toEqual({ ...flash, prefix: alias.prefix });
    }
  });

  it('adds no legacy names without the footnote or when it names an unknown model', () => {
    expect(extractDeepSeek([table])).toHaveLength(2);
    expect(
      extractDeepSeek(
        [table],
        footnote.replace('DeepSeek-V4.1-Flash', 'Other'),
      ),
    ).toHaveLength(2);
  });
});

describe('OpenRouter: Mistral sizes', () => {
  const model = (id, created, prompt, completion) => ({
    id,
    created,
    pricing: { prompt, completion },
    context_length: 1000,
  });

  it('lets the newest model of a size stand for its name', () => {
    const rows = extractOpenRouter({
      data: [
        model(
          'mistralai/mistral-small-3.2-24b-instruct',
          1750000000,
          '0.0000001',
          '0.0000003',
        ),
        model(
          'mistralai/mistral-small-2603',
          1773000000,
          '0.00000015',
          '0.0000006',
        ),
        model(
          'mistralai/mistral-small-24b-instruct-2501',
          1738000000,
          '0.00000005',
          '0.00000008',
        ),
        model(
          'mistralai/mistral-large-2512',
          1764000000,
          '0.0000005',
          '0.0000015',
        ),
        model(
          'mistralai/mistral-large-2407',
          1721000000,
          '0.000002',
          '0.000006',
        ),
        model('mistralai/mistral-small-2603:free', 1773000001, '0', '0'),
      ],
    });
    expect(rows.map((r) => [r.prefix, r.input, r.output])).toEqual([
      ['mistral-large', 0.5, 1.5],
      ['mistral-small', 0.15, 0.6],
    ]);
    expect(rows[0].info.context).toBe(1000);
  });

  it('does not use other Mistral models under their own names', () => {
    const rows = extractOpenRouter({
      data: [
        model('mistralai/mistral-nemo', 1750000000, '0.0000003', '0.0000009'),
      ],
    });
    expect(rows).toEqual([]);
  });
});

describe('extractDeepSeek', () => {
  it('takes the PEAK cache-miss input and the output price per model column', () => {
    const tables = [
      [
        ['MODEL', 'deepseek-flash(1)', 'deepseek-v4-pro'],
        ['1M INPUT TOKENS(CACHE HIT)', 'OFF-PEAK', '$0.003', '$0.022'],
        ['PEAK', '$0.006', '$0.044'],
        ['1M INPUT TOKENS(CACHE MISS)', 'OFF-PEAK', '$0.15', '$0.66'],
        ['PEAK', '$0.3', '$1.32'],
        ['1M OUTPUT TOKENS', 'OFF-PEAK', '$0.6', '$1.98'],
        ['PEAK', '$1.2', '$3.96'],
        ['CONTEXT LENGTH', '1M'],
        ['MAX OUTPUT', 'MAXIMUM: 384K'],
      ],
    ];
    expect(extractDeepSeek(tables)).toEqual([
      {
        prefix: 'deepseek-flash',
        input: 0.3,
        output: 1.2,
        source: 'deepseek',
        info: { context: 1000000, maxOutput: 384000 },
      },
      {
        prefix: 'deepseek-v4-pro',
        input: 1.32,
        output: 3.96,
        source: 'deepseek',
        info: { context: 1000000, maxOutput: 384000 },
      },
    ]);
  });
});

describe('extractOpenRouter', () => {
  const model = (id, prompt, completion) => ({
    id,
    pricing: { prompt, completion },
  });

  it('converts per-token prices and the ids of the vendors it is used for', () => {
    const rows = extractOpenRouter({
      data: [
        model('openai/gpt-5-mini', '0.00000025', '0.000002'),
        model('anthropic/claude-haiku-4.5', '0.000001', '0.000005'),
        model('meta-llama/llama-3.3-70b-instruct', '0.0000001', '0.0000003'),
        model('openai/gpt-5-mini:batch', '0.000000125', '0.000001'),
        model('google/gemini-2.5-flash-image', '0.0000003', '0.0000025'),
        model('openrouter/auto', '-1', '-1'),
      ],
    });
    expect(rows.map((r) => [r.prefix, r.input, r.output])).toEqual([
      ['gpt-5-mini', 0.25, 2],
      ['claude-haiku-4-5', 1, 5],
    ]);
  });
});

describe('compare', () => {
  const current = [
    ['claude-haiku-4-5', 1, 5],
    ['gpt-5-mini', 0.25, 2],
    ['mistral-small', 0.1, 0.3],
  ];
  const source = (name, official, rows, error) => ({
    name,
    official,
    error,
    rows: rows.map(([prefix, input, output]) => ({
      prefix,
      input,
      output,
      source: name,
    })),
  });

  it('reports unchanged, changed, new and missing models', () => {
    const report = compare(
      [
        source('anthropic', true, [
          ['claude-haiku-4-5', 1, 5],
          ['claude-sonnet-5-5', 2, 10],
        ]),
        source('openrouter', false, [['gpt-5-mini', 0.3, 2.4]]),
      ],
      current,
    );

    expect(report.unchanged.map((r) => r.prefix)).toEqual(['claude-haiku-4-5']);
    expect(report.added.map((r) => r.prefix)).toEqual(['claude-sonnet-5-5']);
    expect(report.changed).toHaveLength(1);
    expect(report.changed[0]).toMatchObject({
      prefix: 'gpt-5-mini',
      old: { input: 0.25, output: 2 },
      input: 0.3,
      suspicious: false,
    });
    expect(report.missing).toEqual(['mistral-small']);
  });

  it('takes OpenRouter for models the official pages do not list', () => {
    const report = compare(
      [source('openrouter', false, [['brand-new-model', 1, 2]])],
      current,
    );
    expect(report.added.map((r) => r.prefix)).toEqual(['brand-new-model']);
  });

  it('with nothing known yet every price of the pages is new', () => {
    const report = compare(
      [
        source('anthropic', true, [['claude-haiku-4-5', 1, 5]]),
        source('openrouter', false, [['gpt-5-mini', 0.25, 2]]),
      ],
      [],
    );
    expect(report.added.map((r) => r.prefix)).toEqual([
      'claude-haiku-4-5',
      'gpt-5-mini',
    ]);
    expect(report.changed).toEqual([]);
  });

  it('lets the official page win and flags a disagreement with OpenRouter', () => {
    const report = compare(
      [
        source('openai', true, [['gpt-5-mini', 0.25, 2]]),
        source('openrouter', false, [['gpt-5-mini', 0.5, 4]]),
      ],
      current,
    );
    expect(report.unchanged.map((r) => r.prefix)).toEqual(['gpt-5-mini']);
    expect(report.conflicts).toHaveLength(1);
  });

  it('marks a change of more than 10x as suspicious', () => {
    const report = compare(
      [source('openai', true, [['gpt-5-mini', 0.25, 40]])],
      current,
    );
    expect(report.changed[0].suspicious).toBe(true);
  });

  it('ignores a source that failed', () => {
    const report = compare(
      [source('anthropic', true, [['claude-haiku-4-5', 9, 9]], 'HTTP 500')],
      current,
    );
    expect(report.changed).toEqual([]);
    expect(report.missing).toContain('claude-haiku-4-5');
  });
});
