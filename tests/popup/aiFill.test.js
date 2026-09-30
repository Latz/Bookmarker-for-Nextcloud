// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/storage.js', () => ({ getOptions: vi.fn() }));
vi.mock('../../src/popup/modules/fillKeywords.js', () => ({
  addKeywordsIfEmpty: vi.fn(),
}));

import { getOptions } from '../../src/lib/storage.js';
import { addKeywordsIfEmpty } from '../../src/popup/modules/fillKeywords.js';
import { fillFromAi } from '../../src/popup/modules/aiFill.js';

const allOn = {
  select_aiProvider: 'openai',
  cbx_aiTags: true,
  cbx_aiDescription: true,
  cbx_showKeywords: true,
  cbx_showDescription: true,
  cbx_autoDescription: true,
};
const page = {
  title: 'T',
  url: 'https://x.test',
  keywords: [],
  description: '',
};

describe('fillFromAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML =
      '<form id="formData"></form><textarea id="description"></textarea>';
    globalThis.chrome = {
      i18n: { getMessage: vi.fn((key) => key) },
      runtime: { sendMessage: vi.fn() },
    };
    getOptions.mockResolvedValue(allOn);
  });

  it('fills empty tags and description from the AI answer', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      keywords: ['ai'],
      description: 'Short.',
    });

    await fillFromAi(page);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      msg: 'aiSuggest',
      data: {
        tags: true,
        description: true,
        title: 'T',
        url: 'https://x.test',
      },
    });
    expect(addKeywordsIfEmpty).toHaveBeenCalledWith(['ai']);
    expect(document.getElementById('description').value).toBe('Short.');
  });

  it('marks the description the AI filled with an icon until it is edited', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ description: 'Short.' });

    await fillFromAi({ ...page, keywords: ['found'] });

    expect(document.querySelectorAll('.ai-badge')).toHaveLength(1);
    expect(
      document.getElementById('description').previousElementSibling.className,
    ).toContain('ai-badge-anchor');
    document.getElementById('description').dispatchEvent(new Event('input'));
    expect(document.querySelector('.ai-badge')).toBeNull();
  });

  it('marks the tags the AI added', async () => {
    document.getElementById('formData').innerHTML =
      '<tags class="tagify"></tags>';
    addKeywordsIfEmpty.mockReturnValue(true);
    chrome.runtime.sendMessage.mockResolvedValue({ keywords: ['ai'] });

    await fillFromAi({ ...page, description: 'found' });

    expect(document.querySelectorAll('.ai-badge')).toHaveLength(1);
  });

  it('adds no icon when nothing was filled in', async () => {
    addKeywordsIfEmpty.mockReturnValue(false);
    chrome.runtime.sendMessage.mockResolvedValue({ keywords: ['ai'] });

    await fillFromAi({ ...page, description: 'found' });

    expect(document.querySelector('.ai-badge')).toBeNull();
  });

  it('shows a status line while waiting and removes it afterwards', async () => {
    let answer;
    chrome.runtime.sendMessage.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const running = fillFromAi(page);
    await vi.waitFor(() =>
      expect(document.getElementById('ai_status')?.textContent).toBe(
        'aiSuggesting',
      ),
    );
    answer({});
    await running;

    expect(document.getElementById('ai_status')).toBeNull();
  });

  it('does not overwrite a description the user has started', async () => {
    const field = document.getElementById('description');
    field.dataset.touched = 'true';
    chrome.runtime.sendMessage.mockResolvedValue({ description: 'AI' });

    await fillFromAi(page);

    expect(field.value).toBe('');
  });

  it('asks only for what is missing', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({});

    await fillFromAi({ ...page, keywords: ['found'] });

    expect(chrome.runtime.sendMessage.mock.calls[0][0].data).toMatchObject({
      tags: false,
      description: true,
    });
  });

  it.each([
    ['the provider is off', { select_aiProvider: 'off' }, page],
    [
      'both toggles are off',
      { cbx_aiTags: false, cbx_aiDescription: false },
      page,
    ],
    [
      'the page already has tags and description',
      {},
      { ...page, keywords: ['a'], description: 'd' },
    ],
    [
      'the description is not filled automatically',
      { cbx_autoDescription: false, cbx_aiTags: false },
      page,
    ],
  ])('sends nothing when %s', async (_name, overrides, data) => {
    getOptions.mockResolvedValue({ ...allOn, ...overrides });

    await fillFromAi(data);

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
