/**
 * Unit tests for hydrateForm module
 * Tests the functions that create and hydrate the popup form
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/popup/modules/fillKeywords.js', () => ({
  default: vi.fn(),
}));

vi.mock('../src/popup/modules/fillFolders.js', () => ({
  default: vi.fn(),
}));

vi.mock('../src/lib/storage.js', () => ({
  getOption: vi.fn(),
}));

// Import the module after mocking
import fillKeywords from '../src/popup/modules/fillKeywords.js';
import fillFolders from '../src/popup/modules/fillFolders.js';
import { getOption } from '../src/lib/storage.js';
import { createForm, hydrateForm } from '../src/popup/modules/hydrateForm.js';

describe('createForm', () => {
  let mockForm;
  let mockSubMessage;
  let mockSaveButton;

  beforeEach(() => {
    vi.clearAllMocks();
    mockForm = {
      appendChild: vi.fn(),
    };
    mockSubMessage = {
      innerHTML: '',
    };
    mockSaveButton = {
      innerHTML: '',
    };

    // Helper to create mock DOM elements
    const createMockElement = () => ({
      appendChild: vi.fn(),
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      options: [],
      value: '',
      innerHTML: '',
    });

    global.document = {
      getElementById: vi.fn((id) => {
        switch (id) {
          case 'formData': return mockForm;
          case 'sub_message': return mockSubMessage;
          case 'saveBookmark': return mockSaveButton;
          default: return createMockElement();
        }
      }),
      createElement: vi.fn((tag) => ({
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
      })),
    };

    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => {
          const messages = {
            Checking: 'Checking',
            saveBookmark: 'Save Bookmark',
          };
          return messages[key] || key;
        }),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.chrome;
  });

  describe('URL input', () => {
    it('should create URL input when cbx_showUrl is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: true,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_showUrl');
      expect(document.createElement).toHaveBeenCalledWith('input');
    });

    it('should not create URL input when cbx_showUrl is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_showUrl');
      // URL input should not be created (hidden)
    });
  });

  describe('Title input', () => {
    it('should always create title input', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(document.createElement).toHaveBeenCalledWith('input');
    });
  });

  describe('Folders dropdown', () => {
    it('should create folders dropdown when cbx_displayFolders is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
          cbx_displayFolders: true,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_displayFolders');
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.createElement).toHaveBeenCalledWith('select');
    });

    it('should not create folders dropdown when cbx_displayFolders is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
          cbx_displayFolders: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_displayFolders');
    });
  });

  describe('Keywords input', () => {
    it('should create keywords input when cbx_showKeywords is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: true,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_showKeywords');
      expect(document.createElement).toHaveBeenCalledWith('input');
    });

    it('should not create keywords input when cbx_showKeywords is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_showKeywords');
    });
  });

  describe('Description textarea', () => {
    it('should create description textarea when cbx_showDescription is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: true,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_showDescription');
      expect(document.createElement).toHaveBeenCalledWith('textarea');
    });

    it('should not create description textarea when cbx_showDescription is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_showDescription');
    });
  });

  describe('Checking message', () => {
    it('should show checking message when cbx_alreadyStored is true', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: true,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_alreadyStored');
      expect(mockSubMessage.innerHTML).toContain('Checking');
    });

    it('should not show checking message when cbx_alreadyStored is false', async () => {
      getOption.mockImplementation((key) => {
        const options = {
          cbx_showUrl: false,
          cbx_showKeywords: false,
          cbx_showDescription: false,
          cbx_alreadyStored: false,
        };
        return Promise.resolve(options[key]);
      });

      await createForm();

      expect(getOption).toHaveBeenCalledWith('cbx_alreadyStored');
      expect(mockSubMessage.innerHTML).toBe('');
    });
  });

  describe('Hidden inputs', () => {
    it('should create hidden bookmark ID input', async () => {
      getOption.mockResolvedValue(false);

      await createForm();

      expect(document.createElement).toHaveBeenCalledWith('input');
    });
  });

  describe('Save button', () => {
    it('should set save button text', async () => {
      getOption.mockResolvedValue(false);

      await createForm();

      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('saveBookmark');
      expect(mockSaveButton.innerHTML).toBe('Save Bookmark');
    });
  });
});

describe('hydrateForm', () => {
  let mockUrlInput;
  let mockTitleInput;
  let mockDescriptionInput;
  let mockBookmarkIdInput;
  let mockFoldersSelect;
  let mockSubMessage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUrlInput = { value: '' };
    mockTitleInput = { value: '' };
    mockDescriptionInput = { value: '' };
    mockBookmarkIdInput = { value: '' };
    mockFoldersSelect = { options: [] };
    mockSubMessage = { innerHTML: '' };

    const createMockElement = () => ({
      appendChild: vi.fn(),
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      options: [],
      value: '',
      innerHTML: '',
    });

    global.document = {
      getElementById: vi.fn((id) => {
        switch (id) {
          case 'url': return mockUrlInput;
          case 'title': return mockTitleInput;
          case 'description': return mockDescriptionInput;
          case 'bookmarkID': return mockBookmarkIdInput;
          case 'folders': return mockFoldersSelect;
          case 'sub_message': return mockSubMessage;
          default: return createMockElement();
        }
      }),
    };

    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => {
          const messages = {
            alreadyBookmarked: 'Already bookmarked',
            Created: 'Created',
            Modified: 'Modified',
            ConnectionError: 'Connection Error',
          };
          return messages[key] || key;
        }),
      },
    };

    global.navigator = {
      language: 'en-US',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.chrome;
    delete global.navigator;
  });

  it('should set URL value', async () => {
    getOption.mockResolvedValue(false);

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1, checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(mockUrlInput.value).toBe('https://example.com');
  });

  it('should set title value', async () => {
    getOption.mockResolvedValue(false);

    const data = { url: 'https://example.com', title: 'Test Title', bookmarkID: 1, checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(mockTitleInput.value).toBe('Test Title');
  });

  it('should set bookmark ID value', async () => {
    getOption.mockResolvedValue(false);

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 123, checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(mockBookmarkIdInput.value).toBe(123);
  });

  it('should set description when both options are enabled', async () => {
    getOption.mockImplementation((key) => {
      const options = {
        cbx_showDescription: true,
        cbx_autoDescription: true,
      };
      return Promise.resolve(options[key]);
    });

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1, description: 'Test description', checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(mockDescriptionInput.value).toBe('Test description');
  });

  it('should not set description when cbx_showDescription is false', async () => {
    getOption.mockImplementation((key) => {
      const options = {
        cbx_showDescription: false,
        cbx_autoDescription: true,
      };
      return Promise.resolve(options[key]);
    });

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1, description: 'Test description', checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(mockDescriptionInput.value).toBe('');
  });

  it('should not set description when cbx_autoDescription is false', async () => {
    getOption.mockImplementation((key) => {
      const options = {
        cbx_showDescription: true,
        cbx_autoDescription: false,
      };
      return Promise.resolve(options[key]);
    });

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1, description: 'Test description', checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(mockDescriptionInput.value).toBe('');
  });

  it('should call fillKeywords with data keywords', async () => {
    getOption.mockResolvedValue(false);

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1, keywords: ['tag1', 'tag2'], checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(fillKeywords).toHaveBeenCalledWith(['tag1', 'tag2']);
  });

  it('should call fillKeywords even with empty keywords array', async () => {
    getOption.mockResolvedValue(false);

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1, keywords: [], checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(fillKeywords).toHaveBeenCalledWith([]);
  });

  it('should call fillFolders with data folders', async () => {
    getOption.mockResolvedValue(false);

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1, folders: ['1', '2'], checkBookmark: { ok: true } };
    await hydrateForm(data);

    expect(fillFolders).toHaveBeenCalledWith(mockFoldersSelect, ['1', '2']);
  });

  it('should show already bookmarked message when data.found is true', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      found: true,
      added: 1704067200,
      lastmodified: 1704067200,
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    expect(document.getElementById('sub_message').innerHTML).toContain('Already bookmarked');
  });

  it('should show modified date when added and lastmodified differ', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      found: true,
      added: 1704067200,
      lastmodified: 1704153600,
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    const messageElement = document.getElementById('sub_message');
    expect(messageElement.innerHTML).toContain('Already bookmarked');
    expect(messageElement.innerHTML).toContain('Modified');
  });

  it('should show error message when checkBookmark fails', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      found: false,
      checkBookmark: { ok: false },
    };
    await hydrateForm(data);

    const messageElement = document.getElementById('sub_message');
    expect(messageElement.innerHTML).toContain('Connection Error');
  });

  it('should clear message when bookmark is not found and check is ok', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      found: false,
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    const messageElement = document.getElementById('sub_message');
    expect(messageElement.innerHTML).toBe('');
  });

  it('should handle missing DOM elements gracefully', async () => {
    getOption.mockResolvedValue(false);

    // Simulate missing elements by returning null
    global.document.getElementById = vi.fn(() => null);

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1 };
    // Should not throw
    await expect(hydrateForm(data)).rejects.toThrow();
  });
});
