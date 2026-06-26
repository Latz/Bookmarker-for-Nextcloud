/**
 * Unit tests for zenMode module
 * Tests the zen mode functionality for quick bookmarking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/lib/storage.js', () => ({
  load_data: vi.fn(),
}));

vi.mock('../src/background/modules/getData.js', () => ({
  default: vi.fn(),
}));

vi.mock('../src/lib/apiCall.js', () => ({
  default: vi.fn(),
}));

vi.mock('../src/background/modules/notification.js', () => ({
  notifyUser: vi.fn(),
}));

// Mock chrome APIs
globalThis.chrome = {
  action: {
    setBadgeText: vi.fn(),
  },
};

// Import the module after mocking
import { zenMode } from '../src/background/modules/zenMode.js';
import getData from '../src/background/modules/getData.js';
import apiCall from '../src/lib/apiCall.js';
import { notifyUser } from '../src/background/modules/notification.js';
import { load_data } from '../src/lib/storage.js';

describe('zenMode', () => {
  let mockData;

  beforeEach(() => {
    vi.clearAllMocks();
    mockData = {
      title: 'Test Page',
      url: 'https://example.com',
      description: 'Test description',
      keywords: ['keyword1', 'keyword2'],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic zen mode functionality', () => {
    it('should save bookmark with basic data', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(getData).toHaveBeenCalled();
      expect(load_data).toHaveBeenCalledWith('options', 'zenFolderIDs');
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('title=Test+Page')
      );
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('url=https%3A%2F%2Fexample.com')
      );
      expect(notifyUser).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should set loading badge when starting', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '💾' });
    });

    it('should clear loading badge when complete', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });

    it('should handle API errors gracefully', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'error', statusText: 'API error' });

      await zenMode();

      expect(notifyUser).toHaveBeenCalledWith({ status: 'error', statusText: 'API error' });
    });
  });

  describe('Folder handling', () => {
    it('should include selected folders in request', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(['folder1', 'folder2'])  // zenFolderIDs
        .mockResolvedValueOnce(undefined)               // input_zenKeywords
        .mockResolvedValueOnce(true);                   // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(load_data).toHaveBeenCalledWith('options', 'zenFolderIDs');
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('folders%5B%5D=folder1&folders%5B%5D=folder2')
      );
    });

    it('should not include folders parameter when none selected', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.not.stringContaining('folders[]=')
      );
    });

    it('should handle empty folder array', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce([])          // zenFolderIDs (empty)
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      // Empty array should not add folders parameter
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.not.stringContaining('folders[]=')
      );
    });
  });

  describe('Tag handling', () => {
    it('should include zen keywords in request', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)           // zenFolderIDs
        .mockResolvedValueOnce(['zen1', 'zen2'])    // input_zenKeywords
        .mockResolvedValueOnce(true);               // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(load_data).toHaveBeenCalledWith('options', 'input_zenKeywords');
      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('tags%5B%5D=zen1&tags%5B%5D=zen2')
      );
    });

    it('should include data keywords in request', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('tags%5B%5D=keyword1&tags%5B%5D=keyword2')
      );
    });

    it('should combine zen keywords and data keywords', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(['zen1'])    // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      const callArgs = apiCall.mock.calls[0][2];
      expect(callArgs).toContain('tags%5B%5D=zen1');
      expect(callArgs).toContain('tags%5B%5D=keyword1');
      expect(callArgs).toContain('tags%5B%5D=keyword2');
    });

    it('should handle empty keywords', async () => {
      const emptyData = {
        title: 'Test Page',
        url: 'https://example.com',
        description: 'Test description',
        keywords: [],
      };
      getData.mockResolvedValue(emptyData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(['zen1'])    // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('tags%5B%5D=zen1')
      );
    });

    it('should handle no keywords at all', async () => {
      const emptyData = {
        title: 'Test Page',
        url: 'https://example.com',
        description: 'Test description',
        keywords: [],
      };
      getData.mockResolvedValue(emptyData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      // Should still work with no tags
      expect(apiCall).toHaveBeenCalled();
    });
  });

  describe('URL encoding', () => {
    it('should properly encode title', async () => {
      const specialData = {
        title: 'Test & "Special" <Page>',
        url: 'https://example.com',
        description: 'Test',
        keywords: [],
      };
      getData.mockResolvedValue(specialData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('title=Test+%26+%22Special%22+%3CPage%3E')
      );
    });

    it('should properly encode URL', async () => {
      const specialData = {
        title: 'Test',
        url: 'https://example.com/path?query=value&other=123',
        description: 'Test',
        keywords: [],
      };
      getData.mockResolvedValue(specialData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('url=https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue%26other%3D123')
      );
    });

    it('should properly encode description', async () => {
      const specialData = {
        title: 'Test',
        url: 'https://example.com',
        description: 'Test & "description" with <special> chars',
        keywords: [],
      };
      getData.mockResolvedValue(specialData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('description=Test+%26+%22description%22+with+%3Cspecial%3E+chars')
      );
    });
  });

  describe('Request parameters', () => {
    it('should include page=-1 parameter', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.stringContaining('page=-1')
      );
    });

    it('should use POST method', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.any(String)
      );
    });

    it('should use correct endpoint', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(apiCall).toHaveBeenCalledWith(
        'index.php/apps/bookmarks/public/rest/v2/bookmark',
        'POST',
        expect.any(String)
      );
    });
  });

  describe('Notification guard (cbx_zenDisplayNotification)', () => {
    it('should call notifyUser when cbx_zenDisplayNotification is true', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(notifyUser).toHaveBeenCalled();
    });

    it('should NOT call notifyUser for success when cbx_zenDisplayNotification is false', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(false);      // cbx_zenDisplayNotification
      apiCall.mockResolvedValue({ status: 'success' });

      await zenMode();

      expect(notifyUser).not.toHaveBeenCalled();
    });

    it('should always call notifyUser for errors regardless of cbx_zenDisplayNotification', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(false);      // notifications disabled
      apiCall.mockResolvedValue({ status: 'error', statusText: 'Server error' });

      await zenMode();

      expect(notifyUser).toHaveBeenCalledWith({ status: 'error', statusText: 'Server error' });
    });
  });

  describe('Error handling', () => {
    it('should handle getData error', async () => {
      getData.mockRejectedValue(new Error('Failed to get data'));

      await expect(zenMode()).rejects.toThrow('Failed to get data');
    });

    it('should handle load_data error for folders', async () => {
      getData.mockResolvedValue(mockData);
      load_data.mockRejectedValue(new Error('Storage error'));

      await expect(zenMode()).rejects.toThrow('Storage error');
    });

    it('should handle load_data error for keywords', async () => {
      getData.mockResolvedValue(mockData);
      load_data.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('Storage error'));

      await expect(zenMode()).rejects.toThrow('Storage error');
    });

    it('should handle apiCall error', async () => {
      getData.mockResolvedValue(mockData);
      load_data
        .mockResolvedValueOnce(undefined)   // zenFolderIDs
        .mockResolvedValueOnce(undefined)   // input_zenKeywords
        .mockResolvedValueOnce(true);       // cbx_zenDisplayNotification (default: on)
      apiCall.mockRejectedValue(new Error('Network error'));

      await expect(zenMode()).rejects.toThrow('Network error');
    });
  });
});
