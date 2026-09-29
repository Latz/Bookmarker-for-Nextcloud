// @vitest-environment happy-dom
/**
 * Unit tests for hydrateForm module
 * Tests the functions that create and hydrate the popup form
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const createMockElement = () => ({
  appendChild: vi.fn(),
  setAttribute: vi.fn(),
  addEventListener: vi.fn(),
  options: [],
  value: '',
  innerHTML: '',
});

// Mock dependencies
vi.mock('../../src/popup/modules/fillKeywords.js', () => ({
  default: vi.fn(),
  replaceKeywords: vi.fn(),
}));

vi.mock('../../src/popup/modules/fillFolders.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../src/lib/storage.js', () => {
  const getOption = vi.fn();
  // Adapter: hydrateForm now uses getOptions(), but tests mock getOption individually.
  // getOptions delegates to getOption so all existing assertions still hold.
  const getOptions = vi.fn(async (keys) => {
    const entries = await Promise.all(
      keys.map(async (key) => [key, await getOption(key)]),
    );
    return Object.fromEntries(entries);
  });
  return { getOption, getOptions };
});

// Import the module after mocking
import fillKeywords, { replaceKeywords } from '../../src/popup/modules/fillKeywords.js';
import fillFolders from '../../src/popup/modules/fillFolders.js';
import { getOption } from '../../src/lib/storage.js';
import {
  applyBookmarkStatus,
  createForm,
  hydrateForm,
} from '../../src/popup/modules/hydrateForm.js';

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
      textContent: '',
      replaceChildren: vi.fn(function (...nodes) {
        mockSubMessage.innerHTML = nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
        mockSubMessage.textContent = mockSubMessage.innerHTML;
      }),
      append: vi.fn(function (...nodes) {
        const text = nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
        mockSubMessage.innerHTML += text;
        mockSubMessage.textContent += text;
      }),
    };
    mockSaveButton = {
      innerHTML: '',
      textContent: '',
    };

    const createDOMElement = (tag) => {
      const el = {
        tagName: tag,
        className: '',
        textContent: '',
        id: '',
        innerHTML: '',
      };
      el.setAttribute = vi.fn();
      el.appendChild = vi.fn();
      el.append = vi.fn((...nodes) => {
        el.textContent += nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
      });
      return el;
    };

    globalThis.document = {
      getElementById: vi.fn((id) => {
        switch (id) {
          case 'formData':
            return mockForm;
          case 'sub_message':
            return mockSubMessage;
          case 'saveBookmark':
            return mockSaveButton;
          default:
            return createMockElement();
        }
      }),
      createElement: vi.fn((tag) => createDOMElement(tag)),
    };

    globalThis.chrome = {
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
    delete globalThis.chrome;
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
      expect(mockSubMessage.textContent).toContain('Checking');
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
      expect(mockSubMessage.textContent).toBe('');
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
    const options = (alreadyStored) => (key) =>
      Promise.resolve({ cbx_alreadyStored: alreadyStored }[key]);

    it('is locked while the server lookup is running', async () => {
      getOption.mockImplementation(options(true));

      await createForm();

      // saving now could create a second bookmark for a stored page
      expect(mockSaveButton.disabled).toBe(true);
    });

    it('is not locked when there is no lookup to wait for', async () => {
      getOption.mockImplementation(options(false));

      await createForm();

      expect(mockSaveButton.disabled).toBeUndefined();
    });

    it('should set save button text', async () => {
      getOption.mockResolvedValue(false);

      await createForm();

      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('saveBookmark');
      expect(mockSaveButton.textContent).toBe('Save Bookmark');
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
    mockSubMessage = {
      innerHTML: '',
      textContent: '',
      replaceChildren: vi.fn(function (...nodes) {
        mockSubMessage.innerHTML = nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
        mockSubMessage.textContent = mockSubMessage.innerHTML;
      }),
      append: vi.fn(function (...nodes) {
        const text = nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
        mockSubMessage.innerHTML += text;
        mockSubMessage.textContent += text;
      }),
    };

    const createLocalMockElement = () => ({
      appendChild: vi.fn(),
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      options: [],
      value: '',
      innerHTML: '',
    });

    const createDOMElement = (tag) => {
      const el = {
        tagName: tag,
        className: '',
        textContent: '',
        id: '',
        innerHTML: '',
      };
      el.setAttribute = vi.fn();
      el.appendChild = vi.fn();
      el.append = vi.fn((...nodes) => {
        el.textContent += nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
      });
      return el;
    };

    globalThis.document = {
      getElementById: vi.fn((id) => {
        switch (id) {
          case 'url':
            return mockUrlInput;
          case 'title':
            return mockTitleInput;
          case 'description':
            return mockDescriptionInput;
          case 'bookmarkID':
            return mockBookmarkIdInput;
          case 'folders':
            return mockFoldersSelect;
          case 'sub_message':
            return mockSubMessage;
          default:
            return createLocalMockElement();
        }
      }),
      createElement: vi.fn((tag) => createDOMElement(tag)),
    };

    globalThis.chrome = {
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

    vi.stubGlobal('navigator', { language: 'en-US' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.chrome;
    vi.unstubAllGlobals();
  });

  it('should set URL value', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    expect(mockUrlInput.value).toBe('https://example.com');
  });

  it('should set title value', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test Title',
      bookmarkID: 1,
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    expect(mockTitleInput.value).toBe('Test Title');
  });

  it('should set bookmark ID value', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 123,
      checkBookmark: { ok: true },
    };
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

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      description: 'Test description',
      checkBookmark: { ok: true },
    };
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

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      description: 'Test description',
      checkBookmark: { ok: true },
    };
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

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      description: 'Test description',
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    expect(mockDescriptionInput.value).toBe('');
  });

  it('should call fillKeywords with data keywords', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      keywords: ['tag1', 'tag2'],
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    expect(fillKeywords).toHaveBeenCalledWith(['tag1', 'tag2']);
  });

  it('should call fillKeywords even with empty keywords array', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      keywords: [],
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    expect(fillKeywords).toHaveBeenCalledWith([]);
  });

  it('should call fillFolders with data folders', async () => {
    getOption.mockResolvedValue(false);

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      folders: ['1', '2'],
      checkBookmark: { ok: true },
    };
    await hydrateForm(data);

    expect(fillFolders).toHaveBeenCalledWith(mockFoldersSelect, ['1', '2']);
  });

  it('should reject when fillKeywords or fillFolders fails', async () => {
    getOption.mockResolvedValue(false);
    fillKeywords.mockRejectedValueOnce(new Error('tagify failed'));

    const data = {
      url: 'https://example.com',
      title: 'Test',
      bookmarkID: 1,
      folders: [],
      checkBookmark: { ok: true },
    };

    await expect(hydrateForm(data)).rejects.toThrow('tagify failed');
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

    expect(document.getElementById('sub_message').textContent).toContain(
      'Already bookmarked',
    );
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
    expect(messageElement.textContent).toContain('Already bookmarked');
    expect(messageElement.textContent).toContain('Modified');
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
    expect(messageElement.textContent).toContain('Connection Error');
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
    expect(messageElement.textContent).toBe('');
  });

  it('should handle missing DOM elements gracefully', async () => {
    getOption.mockResolvedValue(false);

    // Simulate missing elements by returning null
    globalThis.document.getElementById = vi.fn(() => null);

    const data = { url: 'https://example.com', title: 'Test', bookmarkID: 1 };
    // Should not throw
    await expect(hydrateForm(data)).rejects.toThrow();
  });
});

// -----------------------------------------------------------------------------
// The lookup arrives after the form has been filled
// -----------------------------------------------------------------------------
describe('pending lookup', () => {
  let elements;
  let subMessage;

  const field = (value = '') => ({ value, dataset: {} });

  beforeEach(() => {
    vi.clearAllMocks();
    subMessage = {
      textContent: '',
      replaceChildren: vi.fn(function (...nodes) {
        subMessage.textContent = nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
      }),
      append: vi.fn(function (...nodes) {
        subMessage.textContent += nodes
          .map((n) => (typeof n === 'string' ? n : (n.textContent ?? '')))
          .join('');
      }),
    };
    elements = {
      url: field('https://example.com/page'),
      title: field('Page title'),
      description: field('from the page'),
      bookmarkID: field('-1'),
      folders: { options: [] },
      sub_message: subMessage,
      saveBookmark: { disabled: true },
    };
    globalThis.document = {
      getElementById: vi.fn((id) => elements[id] ?? null),
      createElement: vi.fn(() => ({
        className: '',
        textContent: '',
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
      })),
    };
    globalThis.chrome = {
      i18n: {
        getMessage: vi.fn((key) => key),
      },
    };
    vi.stubGlobal('navigator', { language: 'en-US' });
    getOption.mockImplementation((key) =>
      Promise.resolve({ cbx_showDescription: true, cbx_autoDescription: true }[key]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.chrome;
    vi.unstubAllGlobals();
  });

  describe('hydrateForm with checkPending', () => {
    const pageData = {
      url: 'https://example.com/page',
      title: 'Page title',
      description: 'from the page',
      keywords: ['a'],
      folders: [],
      bookmarkID: -1,
      checkPending: true,
    };

    it('fills the form but leaves the spinner and the locked Save button', async () => {
      await hydrateForm(pageData);

      expect(elements.title.value).toBe('Page title');
      expect(elements.description.value).toBe('from the page');
      expect(fillKeywords).toHaveBeenCalledWith(['a']);
      // no status text yet, and no crash for the missing lookup result
      expect(subMessage.replaceChildren).not.toHaveBeenCalled();
      expect(elements.saveBookmark.disabled).toBe(true);
    });

    it('releases the Save button when the data already carries the lookup', async () => {
      await hydrateForm({ ...pageData, checkPending: undefined, checkBookmark: { ok: true } });

      expect(elements.saveBookmark.disabled).toBe(false);
    });
  });

  describe('applyBookmarkStatus', () => {
    const stored = {
      ok: true,
      found: true,
      bookmarkID: 42,
      url: 'https://example.com/stored',
      title: 'Stored title',
      description: 'Stored description',
      keywords: ['x', 'y'],
      added: 1700000000,
      lastmodified: 1700000000,
      checkBookmark: { ok: true },
    };

    it('swaps in the stored bookmark for a page that is already bookmarked', async () => {
      await applyBookmarkStatus(stored);

      expect(elements.url.value).toBe('https://example.com/stored');
      expect(elements.title.value).toBe('Stored title');
      expect(elements.description.value).toBe('Stored description');
      expect(replaceKeywords).toHaveBeenCalledWith(['x', 'y']);
      expect(elements.bookmarkID.value).toBe(42);
      expect(subMessage.textContent).toContain('alreadyBookmarked');
      expect(elements.saveBookmark.disabled).toBe(false);
    });

    it('mentions the modification date only if it differs from the creation date', async () => {
      await applyBookmarkStatus({ ...stored, lastmodified: 1700086400 });

      expect(subMessage.textContent).toContain('Modified');
    });

    it('keeps the fields the user has already edited', async () => {
      elements.title.value = 'My own title';
      elements.title.dataset.touched = 'true';

      await applyBookmarkStatus(stored);

      expect(elements.title.value).toBe('My own title');
      expect(elements.url.value).toBe('https://example.com/stored');
    });

    it('leaves the description alone when it is not prefilled from the page', async () => {
      getOption.mockImplementation((key) =>
        Promise.resolve({ cbx_showDescription: true, cbx_autoDescription: false }[key]),
      );

      await applyBookmarkStatus(stored);

      expect(elements.description.value).toBe('from the page');
    });

    it('needs no stored value to be present', async () => {
      await applyBookmarkStatus({ ok: true, found: true, bookmarkID: 5, checkBookmark: { ok: true } });

      expect(elements.title.value).toBe('Page title');
      expect(elements.bookmarkID.value).toBe(5);
    });

    it('clears the spinner for a page that is not bookmarked', async () => {
      await applyBookmarkStatus({
        ok: true,
        found: false,
        bookmarkID: -1,
        checkBookmark: { ok: true },
      });

      expect(subMessage.replaceChildren).toHaveBeenCalledWith();
      expect(replaceKeywords).not.toHaveBeenCalled();
      expect(elements.title.value).toBe('Page title');
      expect(elements.bookmarkID.value).toBe(-1);
      expect(elements.saveBookmark.disabled).toBe(false);
    });

    it('says so when the server could not be reached', async () => {
      await applyBookmarkStatus({
        ok: true,
        found: false,
        bookmarkID: -1,
        checkBookmark: { ok: false },
      });

      expect(subMessage.textContent).toContain('ConnectionError');
      expect(elements.saveBookmark.disabled).toBe(false);
    });

    it('treats a failed request like an unreachable server', async () => {
      await applyBookmarkStatus({ ok: false, error: 'boom' });

      expect(subMessage.textContent).toContain('ConnectionError');
      expect(elements.bookmarkID.value).toBe(-1);
      expect(elements.saveBookmark.disabled).toBe(false);
    });

    it('releases the Save button even when filling the form throws', async () => {
      replaceKeywords.mockImplementationOnce(() => {
        throw new Error('tagify broke');
      });

      await expect(applyBookmarkStatus(stored)).rejects.toThrow('tagify broke');

      expect(elements.saveBookmark.disabled).toBe(false);
    });
  });
});
