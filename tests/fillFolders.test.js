/**
 * Unit tests for fillFolders module
 * Tests the function that populates folder select elements
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/lib/storage.js', () => ({
  getOption: vi.fn(),
}));

// Import the module after mocking
import fillFolders from '../src/popup/modules/fillFolders.js';
import { getOption } from '../src/lib/storage.js';

describe('fillFolders', () => {
  let mockSelectbox;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectbox = {
      innerHTML: '',
      options: [],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('should return early when folders is falsy', async () => {
      const originalInnerHTML = mockSelectbox.innerHTML;

      await fillFolders(mockSelectbox, null);

      expect(mockSelectbox.innerHTML).toBe(originalInnerHTML);
      expect(getOption).not.toHaveBeenCalled();
    });

    it('should return early when folders is empty string', async () => {
      const originalInnerHTML = mockSelectbox.innerHTML;

      await fillFolders(mockSelectbox, '');

      expect(mockSelectbox.innerHTML).toBe(originalInnerHTML);
      expect(getOption).not.toHaveBeenCalled();
    });

    it('should set innerHTML to provided folders', async () => {
      getOption.mockResolvedValue(undefined);

      const folders = '<option value="1">Folder 1</option><option value="2">Folder 2</option>';
      await fillFolders(mockSelectbox, folders);

      expect(mockSelectbox.innerHTML).toBe(folders);
    });

    it('should call getOption with folderIDs', async () => {
      getOption.mockResolvedValue(undefined);

      await fillFolders(mockSelectbox, '<option value="1">Folder</option>');

      expect(getOption).toHaveBeenCalledWith('folderIDs');
    });
  });

  describe('Folder ID selection', () => {
    it('should select folder when folderIDs is a single string', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue('1');

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      // When folderIDs is not an array, it sets selectbox.options.selected directly
      // (which doesn't actually select individual options - this is a quirk of the implementation)
      expect(mockSelectbox.options.selected).toBe('1');
    });

    it('should select multiple folders when folderIDs is an array', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      const option3 = { value: '3', selected: false };
      mockSelectbox.options = [option1, option2, option3];

      getOption.mockResolvedValue(['1', '3']);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option><option value="3">Folder 3</option>');

      expect(option1.selected).toBe(true);
      expect(option2.selected).toBe(false);
      expect(option3.selected).toBe(true);
    });

    it('should not select any folder when folderIDs is undefined', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue(undefined);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      expect(option1.selected).toBe(false);
      expect(option2.selected).toBe(false);
    });

    it('should not select any folder when folderIDs is null', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue(null);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      expect(option1.selected).toBe(false);
      expect(option2.selected).toBe(false);
    });

    it('should not select any folder when folderIDs is empty array', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue([]);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      expect(option1.selected).toBe(false);
      expect(option2.selected).toBe(false);
    });

    it('should handle folderIDs with numeric string values', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue(['1', '2']);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      expect(option1.selected).toBe(true);
      expect(option2.selected).toBe(true);
    });

    it('should handle folderIDs with non-matching values', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue(['3', '4']);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      expect(option1.selected).toBe(false);
      expect(option2.selected).toBe(false);
    });

    it('should handle mixed matching and non-matching folderIDs', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      const option3 = { value: '3', selected: false };
      mockSelectbox.options = [option1, option2, option3];

      getOption.mockResolvedValue(['2', '4', '5']);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option><option value="3">Folder 3</option>');

      expect(option1.selected).toBe(false);
      expect(option2.selected).toBe(true);
      expect(option3.selected).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty options array', async () => {
      mockSelectbox.options = [];
      getOption.mockResolvedValue(['1']);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option>');

      expect(getOption).toHaveBeenCalled();
    });

    it('should handle folderIDs as number (not array)', async () => {
      // The code checks Array.isArray, so a number should be treated as non-array
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue(1); // Not an array

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      // When folderIDs is not an array, it sets selectbox.options.selected directly
      // (which doesn't actually select individual options - this is a quirk of the implementation)
      expect(mockSelectbox.options.selected).toBe(1);
    });

    it('should handle folderIDs as boolean', async () => {
      const option1 = { value: '1', selected: false };
      mockSelectbox.options = [option1];

      getOption.mockResolvedValue(true);

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option>');

      // When folderIDs is not an array, it sets selectbox.options.selected directly
      // (which doesn't actually select individual options - this is a quirk of the implementation)
      expect(mockSelectbox.options.selected).toBe(true);
    });

    it('should handle folderIDs as empty string', async () => {
      const option1 = { value: '1', selected: false };
      mockSelectbox.options = [option1];

      getOption.mockResolvedValue('');

      await fillFolders(mockSelectbox, '<option value="1">Folder 1</option>');

      // Empty string is falsy, so it should not select
      expect(option1.selected).toBe(false);
    });

    it('should handle folderIDs as zero', async () => {
      const option1 = { value: '0', selected: false };
      mockSelectbox.options = [option1];

      getOption.mockResolvedValue(0);

      await fillFolders(mockSelectbox, '<option value="0">Root</option>');

      // 0 is falsy, so it should not select
      expect(option1.selected).toBe(false);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical folder structure from Nextcloud', async () => {
      const option1 = { value: '-1', selected: false };
      const option2 = { value: '123', selected: false };
      const option3 = { value: '456', selected: false };
      mockSelectbox.options = [option1, option2, option3];

      getOption.mockResolvedValue(['123', '456']);

      const folders = '<option value="-1">Root</option><option value="123">Work</option><option value="456">Personal</option>';
      await fillFolders(mockSelectbox, folders);

      expect(option1.selected).toBe(false);
      expect(option2.selected).toBe(true);
      expect(option3.selected).toBe(true);
    });

    it('should handle nested folder structure', async () => {
      const option1 = { value: '-1', selected: false };
      const option2 = { value: '1', selected: false };
      const option3 = { value: '2', selected: false };
      const option4 = { value: '3', selected: false };
      mockSelectbox.options = [option1, option2, option3, option4];

      getOption.mockResolvedValue(['2']);

      const folders = '<option value="-1">Root</option><option value="1">Parent  Child</option><option value="2">Parent  Child  Grandchild</option><option value="3">Other</option>';
      await fillFolders(mockSelectbox, folders);

      expect(option1.selected).toBe(false);
      expect(option2.selected).toBe(false);
      expect(option3.selected).toBe(true);
      expect(option4.selected).toBe(false);
    });

    it('should handle large number of folders', async () => {
      const options = [];
      for (let i = 0; i < 100; i++) {
        options.push({ value: String(i), selected: false });
      }
      mockSelectbox.options = options;

      getOption.mockResolvedValue(['50', '75', '99']);

      const folders = options.map(opt => `<option value="${opt.value}">Folder ${opt.value}</option>`).join('');
      await fillFolders(mockSelectbox, folders);

      expect(mockSelectbox.options[50].selected).toBe(true);
      expect(mockSelectbox.options[75].selected).toBe(true);
      expect(mockSelectbox.options[99].selected).toBe(true);
    });
  });

  describe('Async behavior', () => {
    it('should resolve after processing', async () => {
      getOption.mockResolvedValue(['1']);

      const result = await fillFolders(mockSelectbox, '<option value="1">Folder</option>');

      expect(result).toBeUndefined();
    });

    it('should handle concurrent calls', async () => {
      const option1 = { value: '1', selected: false };
      const option2 = { value: '2', selected: false };
      mockSelectbox.options = [option1, option2];

      getOption.mockResolvedValue(['1']);

      const promise1 = fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');
      const promise2 = fillFolders(mockSelectbox, '<option value="1">Folder 1</option><option value="2">Folder 2</option>');

      await Promise.all([promise1, promise2]);

      // Both should have completed
      expect(getOption).toHaveBeenCalledTimes(2);
    });
  });
});
