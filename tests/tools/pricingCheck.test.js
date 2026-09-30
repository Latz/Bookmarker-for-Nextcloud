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
  extractOpenAI,
  extractOpenRouter,
} from '../../tools/ai-pricing-check/extractors.js';
import {
  compare,
  renderBlock,
  replaceBlock,
} from '../../tools/ai-pricing-check/compare.js';

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
      { prefix: 'gpt-6.1-sol', input: 2, output: 10, source: 'openai' },
      { prefix: 'gpt-6-luna', input: 0.1, output: 0.5, source: 'openai' },
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
      ],
    ];
    expect(extractDeepSeek(tables)).toEqual([
      { prefix: 'deepseek-flash', input: 0.3, output: 1.2, source: 'deepseek' },
      {
        prefix: 'deepseek-v4-pro',
        input: 1.32,
        output: 3.96,
        source: 'deepseek',
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

  it('takes OpenRouter only for models that are already in the list', () => {
    const report = compare(
      [source('openrouter', false, [['brand-new-model', 1, 2]])],
      current,
    );
    expect(report.added).toEqual([]);
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

describe('renderBlock / replaceBlock', () => {
  const entries = [
    ['gpt-5-mini', 0.25, 2],
    ['claude-opus-5-5', 4, 20],
    ['claude-haiku-4-5', 1, 5],
    ['llama-3.3-70b', 0.59, 0.79],
  ];

  it('groups by vendor and sorts inside a group', () => {
    expect(renderBlock(entries)).toBe(
      [
        '  // Anthropic',
        "  ['claude-haiku-4-5', 1, 5],",
        "  ['claude-opus-5-5', 4, 20],",
        '  // OpenAI',
        "  ['gpt-5-mini', 0.25, 2],",
        '  // Others',
        "  ['llama-3.3-70b', 0.59, 0.79],",
      ].join('\n'),
    );
  });

  const file = (eol) =>
    [
      'export const PRICES = [',
      '  // <prices:begin>',
      "  ['old', 1, 1],",
      '  // <prices:end>',
      '];',
    ].join(eol);

  it('replaces only the marked block', () => {
    expect(replaceBlock(file('\n'), "  ['new', 2, 2],")).toBe(
      file('\n').replace("['old', 1, 1]", "['new', 2, 2]"),
    );
  });

  it('keeps CRLF line endings', () => {
    const result = replaceBlock(file('\r\n'), "  ['a', 1, 1],\n  ['b', 2, 2],");
    expect(result).toContain(
      "['a', 1, 1],\r\n  ['b', 2, 2],\r\n  // <prices:end>",
    );
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('refuses a file without the markers', () => {
    expect(() => replaceBlock('const PRICES = [];', 'x')).toThrow('markers');
  });
});
