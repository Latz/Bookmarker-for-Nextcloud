/**
 * Unit tests for getFolders module
 * Tests the function that fetches and renders folder structure from Nextcloud
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/lib/storage.js', () => ({
  getOption: vi.fn(),
}));

vi.mock('../../src/lib/apiCall.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../src/lib/cache.js', () => ({
  cacheGet: vi.fn(),
  cacheAdd: vi.fn(),
}));

vi.mock('../../src/lib/log.js', () => ({
  default: vi.fn(),
}));

// Import the module after mocking
import {
  getFolders,
  preRenderFolders,
} from '../../src/background/modules/bookmarks/getFolders.js';
import { getOption } from '../../src/lib/storage.js';
import apiCall from '../../src/lib/apiCall.js';
import { cacheGet } from '../../src/lib/cache.js';

describe('getFolders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return an empty list when user does not use folders and not forced', async () => {
    getOption.mockResolvedValue(false);

    const result = await getFolders(false);

    expect(result).toEqual([]);
    expect(getOption).toHaveBeenCalledWith('cbx_displayFolders');
    expect(apiCall).not.toHaveBeenCalled();
  });

  it('should load folders when forced even if user disabled folders', async () => {
    getOption.mockResolvedValue(false);
    cacheGet.mockResolvedValue([{ value: '-1', name: 'Root' }]);

    const result = await getFolders(true);

    expect(cacheGet).toHaveBeenCalledWith('folders');
    expect(result).toEqual([{ value: '-1', name: 'Root' }]);
  });

  it('should return what cacheGet returns (it handles cache and server)', async () => {
    getOption.mockResolvedValue(true);
    const cachedFolders = [{ value: '1', name: 'Folder 1' }];
    cacheGet.mockResolvedValue(cachedFolders);

    const result = await getFolders();

    expect(result).toBe(cachedFolders);
    expect(cacheGet).toHaveBeenCalledWith('folders');
  });

  it('should not ask the server a second time when cacheGet found nothing', async () => {
    // cacheGet already tried the server; repeating it doubled the wait offline.
    getOption.mockResolvedValue(true);
    cacheGet.mockResolvedValue([]);

    const result = await getFolders();

    expect(result).toEqual([]);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it('should return an empty list for an unusable cache value', async () => {
    getOption.mockResolvedValue(true);
    cacheGet.mockResolvedValue(undefined);

    expect(await getFolders()).toEqual([]);
  });
});

describe('preRenderFolders', () => {
  beforeEach(() => {
    // Mock navigator.language
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      writable: true,
      configurable: true,
    });
  });

  it('should return root folder when no folders provided', () => {
    const result = preRenderFolders(undefined);

    expect(result).toEqual([{ value: '-1', name: 'Root' }]);
  });

  it('should return root folder when empty array is provided', () => {
    const result = preRenderFolders([]);

    expect(result).toEqual([{ value: '-1', name: 'Root' }]);
  });

  it('should render single folder', () => {
    const folders = [{ id: '1', title: 'My Folder' }];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '-1', name: 'Root' });
    expect(result).toContainEqual({ value: '1', name: 'My Folder' });
  });

  it('should render multiple folders sorted by title', () => {
    const folders = [
      { id: '3', title: 'C Folder' },
      { id: '1', title: 'A Folder' },
      { id: '2', title: 'B Folder' },
    ];

    const result = preRenderFolders(folders);

    // Assert the actual ordering, not just presence: the previous comparator
    // returned a boolean and never sorted, and per-option `toContain` checks
    // passed regardless.
    expect(result).toEqual([
      { value: '-1', name: 'Root' },
      { value: '1', name: 'A Folder' },
      { value: '2', name: 'B Folder' },
      { value: '3', name: 'C Folder' },
    ]);
  });

  it('should render nested folders with proper indentation', () => {
    const folders = [
      {
        id: '1',
        title: 'Parent',
        children: [
          { id: '2', title: 'Child 1' },
          { id: '3', title: 'Child 2' },
        ],
      },
    ];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '1', name: 'Parent' });
    // Uses \u2007\u2007 for indentation (two figure spaces)
    expect(result).toContainEqual({ value: '2', name: '  Child 1' });
    expect(result).toContainEqual({ value: '3', name: '  Child 2' });
  });

  it('should return hostile folder titles as data, never as markup (S1)', () => {
    // preRenderFolders used to build an <option> string with the title
    // interpolated unescaped, which consumers assigned to innerHTML. Titles
    // come from the server and can be set by anyone sharing a folder.
    const hostile = 'Recipes"><img src=x onerror=alert(1)>';
    const result = preRenderFolders([{ id: '9', title: hostile }]);

    expect(result).toContainEqual({ value: '9', name: hostile });
    // No element in the result is a markup string
    for (const entry of result) {
      expect(typeof entry).toBe('object');
      expect(entry).toHaveProperty('value');
      expect(entry).toHaveProperty('name');
    }
  });

  it('should handle deeply nested folders', () => {
    const folders = [
      {
        id: '1',
        title: 'Level 1',
        children: [
          {
            id: '2',
            title: 'Level 2',
            children: [{ id: '3', title: 'Level 3' }],
          },
        ],
      },
    ];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '1', name: 'Level 1' });
    expect(result).toContainEqual({ value: '2', name: '  Level 2' });
    expect(result).toContainEqual({ value: '3', name: '    Level 3' });
  });

  it('should handle folders with special characters in title', () => {
    const folders = [{ id: '1', title: 'Folder & "Special" <Test>' }];

    const result = preRenderFolders(folders);

    // Note: The implementation does NOT HTML-escape the title
    expect(result).toContainEqual({
      value: '1',
      name: 'Folder & "Special" <Test>',
    });
  });

  it('should handle folders with unicode characters', () => {
    const folders = [{ id: '1', title: '📁 中文文件夹' }];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '1', name: '📁 中文文件夹' });
  });

  it('should handle multiple top-level folders', () => {
    const folders = [
      { id: '1', title: 'Folder 1' },
      { id: '2', title: 'Folder 2' },
      { id: '3', title: 'Folder 3' },
    ];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '-1', name: 'Root' });
    expect(result).toContainEqual({ value: '1', name: 'Folder 1' });
    expect(result).toContainEqual({ value: '2', name: 'Folder 2' });
    expect(result).toContainEqual({ value: '3', name: 'Folder 3' });
  });

  it('should handle mixed nested and non-nested folders', () => {
    const folders = [
      { id: '1', title: 'Standalone' },
      {
        id: '2',
        title: 'Parent',
        children: [{ id: '3', title: 'Child' }],
      },
    ];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '1', name: 'Standalone' });
    expect(result).toContainEqual({ value: '2', name: 'Parent' });
    expect(result).toContainEqual({ value: '3', name: '  Child' });
  });

  it('should handle folders with empty title', () => {
    const folders = [{ id: '1', title: '' }];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '1', name: '' });
  });

  it('should handle folders with whitespace-only title', () => {
    const folders = [{ id: '1', title: '   ' }];

    const result = preRenderFolders(folders);

    expect(result).toContainEqual({ value: '1', name: '   ' });
  });
});
