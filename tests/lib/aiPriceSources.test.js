// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import {
  SOURCES,
  cleanDocument,
  documentTables,
  documentText,
  readSource,
} from '../../src/lib/aiPriceSources.js';

const parseHtml = (html) =>
  cleanDocument(new DOMParser().parseFromString(html, 'text/html'));

const mistralPage = `<html><body><script>var x = 1;</script>
  <table>
    <tr><th>Model</th><th>Input</th><th>Cached input</th><th>Output</th></tr>
    <tr><td>Mistral Large 3 ↗</td><td>$0.5</td><td>$0.05</td><td>$1.5</td></tr>
  </table></body></html>`;

describe('SOURCES', () => {
  it('has the seven pages the prices are read from', () => {
    expect(SOURCES.map((s) => s.name)).toEqual([
      'anthropic',
      'openai',
      'google',
      'deepseek',
      'groq',
      'mistral',
      'openrouter',
    ]);
    for (const source of SOURCES) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(typeof source.extract).toBe('function');
    }
    // only OpenRouter is no official source and answers JSON
    expect(SOURCES.filter((s) => !s.official).map((s) => s.name)).toEqual([
      'openrouter',
    ]);
    expect(SOURCES.filter((s) => s.json).map((s) => s.name)).toEqual([
      'openrouter',
    ]);
  });
});

describe('document helpers', () => {
  it('cleanDocument drops scripts and styles, so they are not part of the text', () => {
    const document = parseHtml(
      '<body><style>p{}</style><script>alert(1)</script><p>Hello   world</p></body>',
    );
    expect(documentText(document)).toBe('Hello world');
  });

  it('documentTables gives rows of cell texts', () => {
    const document = parseHtml(
      '<table><tr><th>A</th><th>B</th></tr><tr><td> 1 </td><td>2</td></tr></table>',
    );
    expect(documentTables(document)).toEqual([
      [
        ['A', 'B'],
        ['1', '2'],
      ],
    ]);
  });
});

describe('readSource', () => {
  const mistral = SOURCES.find((s) => s.name === 'mistral');
  const openrouter = SOURCES.find((s) => s.name === 'openrouter');

  it('fetches, parses and extracts the rows of an HTML page', async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValue({ status: 200, body: mistralPage });

    const result = await readSource(mistral, { fetchText, parseHtml });

    expect(fetchText).toHaveBeenCalledWith(mistral.url);
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ name: 'mistral', official: true });
    expect(result.rows[0]).toMatchObject({
      prefix: 'mistral-large',
      input: 0.5,
      output: 1.5,
    });
  });

  it('reads a JSON source without parsing HTML', async () => {
    const parse = vi.fn();
    const body = JSON.stringify({
      data: [
        {
          id: 'openai/gpt-5-mini',
          created: 1754524800,
          pricing: { prompt: '0.00000025', completion: '0.000002' },
        },
      ],
    });

    const result = await readSource(openrouter, {
      fetchText: async () => ({ status: 200, body }),
      parseHtml: parse,
    });

    expect(parse).not.toHaveBeenCalled();
    expect(result.rows[0]).toMatchObject({ prefix: 'gpt-5-mini', input: 0.25 });
  });

  it('reports an HTTP error', async () => {
    const result = await readSource(mistral, {
      fetchText: async () => ({ status: 403, body: '' }),
      parseHtml,
    });
    expect(result.error).toBe('HTTP 403');
    expect(result.rows).toEqual([]);
  });

  it('reports a page without prices (the layout changed)', async () => {
    const result = await readSource(mistral, {
      fetchText: async () => ({ status: 200, body: '<p>Page not found</p>' }),
      parseHtml,
    });
    expect(result.error).toMatch(/no prices found/);
  });

  it('never throws: network errors and broken JSON become errors', async () => {
    const down = await readSource(mistral, {
      fetchText: async () => {
        throw new Error('offline');
      },
      parseHtml,
    });
    expect(down.error).toBe('offline');

    const broken = await readSource(openrouter, {
      fetchText: async () => ({ status: 200, body: '{nope' }),
      parseHtml,
    });
    expect(broken.error).toBeTruthy();
  });
});
