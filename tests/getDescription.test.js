/**
 * Unit tests for getDescription module
 * Tests the function that extracts description from HTML documents
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the getMeta module
vi.mock('../src/background/modules/getMeta.js', () => ({
  default: vi.fn(),
}));

// Import the module after mocking
import getMeta from '../src/background/modules/getMeta.js';
import getDescription from '../src/background/modules/getDescription.js';

describe('getDescription', () => {
  let mockDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocument = {};
  });

  it('should return empty string when no description is found', () => {
    getMeta.mockReturnValue([]);

    const result = getDescription(mockDocument);

    expect(result).toBe('');
    expect(getMeta).toHaveBeenCalledWith(
      mockDocument,
      { type: 'property', id: 'og:description' },
      { type: 'name', id: 'description' },
      { type: 'name', id: 'twitter:description' },
      { type: 'content', id: 'og:description' },
      { type: 'name', id: 'og:description' },
      { type: 'rel', id: 'search' },
      { type: 'http-equiv', id: 'description' }
    );
  });

  it('should return trimmed description from single meta tag', () => {
    getMeta.mockReturnValue(['  Test description  ']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test description');
  });

  it('should return first description when multiple are found', () => {
    getMeta.mockReturnValue(['First description', 'Second description']);

    const result = getDescription(mockDocument);

    expect(result).toBe('First description');
  });

  it('should remove newlines from start and end', () => {
    getMeta.mockReturnValue(['\n\n\nTest description\n\n\n']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test description');
  });

  it('should remove leading newlines only', () => {
    getMeta.mockReturnValue(['\n\nTest description']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test description');
  });

  it('should remove trailing newlines only', () => {
    getMeta.mockReturnValue(['Test description\n\n']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test description');
  });

  it('should preserve internal newlines', () => {
    getMeta.mockReturnValue(['Test\ndescription']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test\ndescription');
  });

  it('should trim whitespace after removing newlines', () => {
    getMeta.mockReturnValue(['  \n\n  Test description  \n\n  ']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test description');
  });

  it('should handle description with only newlines', () => {
    getMeta.mockReturnValue(['\n\n\n']);

    const result = getDescription(mockDocument);

    expect(result).toBe('');
  });

  it('should handle description with only whitespace', () => {
    getMeta.mockReturnValue(['   ']);

    const result = getDescription(mockDocument);

    expect(result).toBe('');
  });

  it('should handle empty string description', () => {
    getMeta.mockReturnValue(['']);

    const result = getDescription(mockDocument);

    expect(result).toBe('');
  });

  it('should handle description with mixed whitespace', () => {
    getMeta.mockReturnValue(['  \t\n  Test  \t\n  ']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test');
  });

  it('should handle real-world description from og:description', () => {
    getMeta.mockReturnValue(['This is a comprehensive description of the page content.']);

    const result = getDescription(mockDocument);

    expect(result).toBe('This is a comprehensive description of the page content.');
  });

  it('should handle description with special characters', () => {
    getMeta.mockReturnValue(['  Test & "special" <chars>  ']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test & "special" <chars>');
  });

  it('should handle description with HTML entities', () => {
    getMeta.mockReturnValue(['  Test &amp; description  ']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test &amp; description');
  });

  it('should handle very long description', () => {
    const longDesc = '  ' + 'A'.repeat(1000) + '  ';
    getMeta.mockReturnValue([longDesc]);

    const result = getDescription(mockDocument);

    expect(result).toBe('A'.repeat(1000));
  });

  it('should handle description with multiple consecutive newlines', () => {
    getMeta.mockReturnValue(['\n\n\n\nTest description\n\n\n\n']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test description');
  });

  it('should handle description with carriage returns', () => {
    getMeta.mockReturnValue(['\r\nTest description\r\n']);

    const result = getDescription(mockDocument);

    // The regex only handles \n, not \r, so carriage returns remain
    // After trim(), the result is 'Test description'
    expect(result).toBe('Test description');
  });

  it('should handle unicode characters in description', () => {
    getMeta.mockReturnValue(['  你好世界 🌍  ']);

    const result = getDescription(mockDocument);

    expect(result).toBe('你好世界 🌍');
  });

  it('should handle description with tabs', () => {
    getMeta.mockReturnValue(['\t\tTest description\t\t']);

    const result = getDescription(mockDocument);

    expect(result).toBe('Test description');
  });

  it('should pass through to getMeta with correct parameters', () => {
    getMeta.mockReturnValue(['Test']);

    getDescription(mockDocument);

    expect(getMeta).toHaveBeenCalledTimes(1);
    expect(getMeta.mock.calls[0][0]).toBe(mockDocument);
  });
});
