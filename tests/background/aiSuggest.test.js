// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/storage.js', () => ({ getOptions: vi.fn() }));
vi.mock('../../src/lib/aiClient.js', () => ({ askAI: vi.fn() }));
vi.mock('../../src/lib/cache.js', () => ({ cacheGet: vi.fn() }));

import { getOptions } from '../../src/lib/storage.js';
import { askAI } from '../../src/lib/aiClient.js';
import { cacheGet } from '../../src/lib/cache.js';
import {
  buildPrompt,
  getAiSuggestions,
  parseAnswer,
} from '../../src/background/modules/page/aiSuggest.js';

const page = { headings: ['Heading'], text: 'Some page text' };

describe('aiSuggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    getOptions.mockResolvedValue({ select_aiProvider: 'openai' });
    cacheGet.mockResolvedValue(['known']);
    globalThis.chrome = {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 7 }]) },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([{ result: page }]),
      },
    };
  });

  describe('parseAnswer', () => {
    it('reads plain JSON and JSON inside a code block', () => {
      expect(parseAnswer('{"tags":["a"]}')).toEqual({ tags: ['a'] });
      expect(parseAnswer('```json\n{"tags":["a"]}\n```')).toEqual({
        tags: ['a'],
      });
    });

    it('returns null for text without valid JSON', () => {
      expect(parseAnswer('no json')).toBeNull();
      expect(parseAnswer('{broken')).toBeNull();
    });
  });

  describe('buildPrompt', () => {
    it('asks only for the requested fields and marks the page as data', () => {
      const tags = buildPrompt(
        { tags: true, title: 'T', url: 'https://x.test' },
        page,
        ['known'],
      );
      expect(tags).toContain('"tags"');
      expect(tags).not.toContain('"description":');
      expect(tags).toContain('["known"]');
      expect(tags).toContain('<page_data>');
      expect(tags).toContain('Some page text');

      const description = buildPrompt({ description: true }, page, []);
      expect(description).toContain('"description"');
      expect(description).not.toContain('"tags"');
    });
  });

  describe('getAiSuggestions', () => {
    it('does nothing when the AI is off or nothing is requested', async () => {
      getOptions.mockResolvedValue({ select_aiProvider: 'off' });
      expect(await getAiSuggestions({ tags: true })).toEqual({});
      getOptions.mockResolvedValue({ select_aiProvider: 'openai' });
      expect(await getAiSuggestions({})).toEqual({});
      expect(askAI).not.toHaveBeenCalled();
    });

    it('returns cleaned tags and a shortened description', async () => {
      const long = `${'word '.repeat(100)}end`;
      askAI.mockResolvedValue(
        JSON.stringify({
          tags: ['one', 'One', 'two', 'three', 'four', 'five', 'six', ''],
          description: long,
        }),
      );

      const result = await getAiSuggestions({ tags: true, description: true });

      expect(result.keywords).toEqual(['one', 'two', 'three', 'four', 'five']);
      expect(result.description.length).toBeLessThanOrEqual(300);
      expect(result.description.endsWith('word')).toBe(true);
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({ target: { tabId: 7 }, args: [3000] }),
      );
    });

    it('returns only the requested fields', async () => {
      askAI.mockResolvedValue('{"tags":["a"],"description":"d"}');
      expect(await getAiSuggestions({ tags: true })).toEqual({
        keywords: ['a'],
      });
      expect(await getAiSuggestions({ description: true })).toEqual({
        description: 'd',
      });
    });

    it.each([
      ['an AI error', () => askAI.mockRejectedValue(new Error('401'))],
      ['an unparsable answer', () => askAI.mockResolvedValue('sorry')],
      [
        'a failed page extraction',
        () =>
          chrome.scripting.executeScript.mockResolvedValue([
            { result: { error: 'x' } },
          ]),
      ],
    ])('answers {} on %s', async (_name, arrange) => {
      askAI.mockResolvedValue('{}');
      arrange();
      expect(await getAiSuggestions({ tags: true })).toEqual({});
    });
  });
});
