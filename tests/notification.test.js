/**
 * Unit tests for notification module
 * Tests the notification functions for user feedback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/lib/storage.js', () => ({
  getOption: vi.fn(),
}));

vi.mock('../src/background/modules/getBrowserTheme.js', () => ({
  default: vi.fn(),
}));

// Mock chrome APIs
global.chrome = {
  runtime: {
    getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
  },
  notifications: {
    create: vi.fn(),
  },
  i18n: {
    getMessage: vi.fn((key) => {
      const messages = {
        error: 'Error',
        dismiss: 'Dismiss',
        BookmarkSuccessfullySaved: 'Bookmark successfully saved',
      };
      return messages[key] || key;
    }),
  },
};

// Import the module after mocking
import { notifyUser, cacheRefreshNotification } from '../src/background/modules/notification.js';
import { getOption } from '../src/lib/storage.js';
import getBrowserTheme from '../src/background/modules/getBrowserTheme.js';

describe('notifyUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error notifications', () => {
    it('should show error notification when response status is error', async () => {
      const response = {
        status: 'error',
        statusText: 'Connection failed',
      };

      getBrowserTheme.mockResolvedValue('dark');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(getBrowserTheme).toHaveBeenCalled();
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          title: 'Bookmarker for Nextcloud',
          message: 'Error: Connection failed',
          type: 'basic',
          requireInteraction: true,
          buttons: [{ title: 'Dismiss.' }],
        })
      );
    });

    it('should use error icon URL for error notifications', async () => {
      const response = {
        status: 'error',
        statusText: 'Test error',
      };

      getBrowserTheme.mockResolvedValue('dark');
      chrome.runtime.getURL.mockReturnValue('chrome-extension://mock-id/images/icon-128x128-dark-error.png');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-dark-error.png');
    });

    it('should handle notification creation error gracefully', async () => {
      const response = {
        status: 'error',
        statusText: 'Test error',
      };

      getBrowserTheme.mockResolvedValue('light');
      chrome.notifications.create.mockRejectedValue(new Error('Notification failed'));

      // Should not throw
      await expect(notifyUser(response)).resolves.not.toThrow();
    });

    it('should fallback to regular icon if error icon does not exist', async () => {
      const response = {
        status: 'error',
        statusText: 'Test error',
      };

      getBrowserTheme.mockResolvedValue('dark');

      // Mock fetch to fail (error icon doesn't exist)
      global.fetch = vi.fn().mockRejectedValue(new Error('Not found'));

      chrome.runtime.getURL
        .mockReturnValueOnce('chrome-extension://mock-id/images/icon-128x128-dark-error.png')
        .mockReturnValueOnce('chrome-extension://mock-id/images/icon-128x128-dark.png');

      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      // Should try error icon first, then fallback to regular icon
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-dark-error.png');
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-dark.png');
    });

    it('should use regular icon if error icon fetch returns non-OK response', async () => {
      const response = {
        status: 'error',
        statusText: 'Test error',
      };

      getBrowserTheme.mockResolvedValue('dark');

      // Mock fetch to return non-OK response
      global.fetch = vi.fn().mockResolvedValue({ ok: false });

      chrome.runtime.getURL
        .mockReturnValueOnce('chrome-extension://mock-id/images/icon-128x128-dark-error.png')
        .mockReturnValueOnce('chrome-extension://mock-id/images/icon-128x128-dark.png');

      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-dark.png');
    });
  });

  describe('Success notifications', () => {
    it('should show success notification when response status is not error', async () => {
      const response = {
        status: 'success',
      };

      getOption.mockResolvedValue(true); // cbx_successMessage enabled
      getBrowserTheme.mockResolvedValue('light');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(getOption).toHaveBeenCalledWith('cbx_successMessage');
      expect(getBrowserTheme).toHaveBeenCalled();
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          title: 'Bookmarker for Nextcloud',
          message: 'Bookmark successfully saved!',
          type: 'basic',
        })
      );
    });

    it('should not show success notification when user disables it', async () => {
      const response = {
        status: 'success',
      };

      getOption.mockResolvedValue(false); // cbx_successMessage disabled

      await notifyUser(response);

      expect(getOption).toHaveBeenCalledWith('cbx_successMessage');
      expect(getBrowserTheme).not.toHaveBeenCalled();
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('should use light theme icon for success notification', async () => {
      const response = {
        status: 'success',
      };

      getOption.mockResolvedValue(true);
      getBrowserTheme.mockResolvedValue('light');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-light.png');
    });

    it('should use dark theme icon for success notification', async () => {
      const response = {
        status: 'success',
      };

      getOption.mockResolvedValue(true);
      getBrowserTheme.mockResolvedValue('dark');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-dark.png');
    });

    it('should handle notification creation error gracefully for success', async () => {
      const response = {
        status: 'success',
      };

      getOption.mockResolvedValue(true);
      getBrowserTheme.mockResolvedValue('light');
      chrome.notifications.create.mockRejectedValue(new Error('Notification failed'));

      // Should not throw
      await expect(notifyUser(response)).resolves.not.toThrow();
    });
  });

  describe('Response status handling', () => {
    it('should handle response with status "error"', async () => {
      const response = {
        status: 'error',
        statusText: 'Test error',
      };

      getBrowserTheme.mockResolvedValue('dark');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(chrome.notifications.create).toHaveBeenCalled();
      expect(getOption).not.toHaveBeenCalled(); // Should not check success option for errors
    });

    it('should handle response with status "success"', async () => {
      const response = {
        status: 'success',
      };

      getOption.mockResolvedValue(true);
      getBrowserTheme.mockResolvedValue('light');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(getOption).toHaveBeenCalledWith('cbx_successMessage');
    });

    it('should handle response with other status values', async () => {
      const response = {
        status: 'pending',
      };

      getOption.mockResolvedValue(true);
      getBrowserTheme.mockResolvedValue('light');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      // Should treat as success (non-error)
      expect(getOption).toHaveBeenCalledWith('cbx_successMessage');
    });
  });

  describe('Internationalization', () => {
    it('should use i18n messages for notification text', async () => {
      const response = {
        status: 'error',
        statusText: 'Test error',
      };

      getBrowserTheme.mockResolvedValue('dark');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('error');
      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('dismiss');
    });

    it('should use i18n messages for success notification', async () => {
      const response = {
        status: 'success',
      };

      getOption.mockResolvedValue(true);
      getBrowserTheme.mockResolvedValue('light');
      chrome.notifications.create.mockResolvedValue('notification-id');

      await notifyUser(response);

      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('BookmarkSuccessfullySaved');
    });
  });
});

describe('cacheRefreshNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show cache refresh notification', async () => {
    getBrowserTheme.mockResolvedValue('light');
    chrome.notifications.create.mockResolvedValue('notification-id');

    await cacheRefreshNotification();

    expect(getBrowserTheme).toHaveBeenCalled();
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        title: 'Bookmarker for Nextcloud',
        message: 'Cache was refreshed',
        type: 'basic',
      })
    );
  });

  it('should use correct icon URL', async () => {
    getBrowserTheme.mockResolvedValue('dark');
    chrome.notifications.create.mockResolvedValue('notification-id');

    await cacheRefreshNotification();

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-dark.png');
  });

  it('should handle notification creation error gracefully', async () => {
    getBrowserTheme.mockResolvedValue('light');
    chrome.notifications.create.mockRejectedValue(new Error('Notification failed'));

    // Should not throw
    await expect(cacheRefreshNotification()).resolves.not.toThrow();
  });

  it('should work with light theme', async () => {
    getBrowserTheme.mockResolvedValue('light');
    chrome.notifications.create.mockResolvedValue('notification-id');

    await cacheRefreshNotification();

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-light.png');
  });

  it('should work with dark theme', async () => {
    getBrowserTheme.mockResolvedValue('dark');
    chrome.notifications.create.mockResolvedValue('notification-id');

    await cacheRefreshNotification();

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('/images/icon-128x128-dark.png');
  });
});
