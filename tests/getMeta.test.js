/**
 * Unit tests for getMeta module
 * Tests the function that extracts meta tag values from HTML documents
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import log from '../src/lib/log.js';

// Mock the log module
vi.mock('../src/lib/log.js', () => ({
  default: vi.fn(),
}));

// Import the module after mocking
import getMeta from '../src/background/modules/getMeta.js';

describe('getMeta', () => {
  let mockDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocument = {
      querySelectorAll: vi.fn(),
    };
  });

  it('should return empty array when no meta tags match', () => {
    mockDocument.querySelectorAll.mockReturnValue([]);

    const result = getMeta(mockDocument, { type: 'name', id: 'description' });

    expect(result).toEqual([]);
    expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[name="description" i]');
  });

  it('should extract content from a single matching meta tag', () => {
    const mockMeta = { content: 'Test description' };
    mockDocument.querySelectorAll.mockReturnValue([mockMeta]);

    const result = getMeta(mockDocument, { type: 'name', id: 'description' });

    expect(result).toEqual(['Test description']);
  });

  it('should extract content from multiple matching meta tags', () => {
    const mockMetas = [
      { content: 'First description' },
      { content: 'Second description' },
    ];
    mockDocument.querySelectorAll.mockReturnValue(mockMetas);

    const result = getMeta(mockDocument, { type: 'name', id: 'description' });

    expect(result).toEqual(['First description', 'Second description']);
  });

  it('should skip meta tags with empty content', () => {
    const mockMetas = [
      { content: '' },
      { content: 'Valid description' },
      { content: undefined },
    ];
    mockDocument.querySelectorAll.mockReturnValue(mockMetas);

    const result = getMeta(mockDocument, { type: 'name', id: 'description' });

    expect(result).toEqual(['Valid description']);
  });

  it('should check multiple meta tag types and return first match', () => {
    const mockMetas = [{ content: 'Open Graph description' }];
    mockDocument.querySelectorAll
      .mockReturnValueOnce([]) // First type (property) - no match
      .mockReturnValueOnce(mockMetas); // Second type (name) - match

    const result = getMeta(
      mockDocument,
      { type: 'property', id: 'og:description' },
      { type: 'name', id: 'description' }
    );

    expect(result).toEqual(['Open Graph description']);
    expect(mockDocument.querySelectorAll).toHaveBeenCalledTimes(2);
  });

  it('should return empty array when no types match', () => {
    mockDocument.querySelectorAll.mockReturnValue([]);

    const result = getMeta(
      mockDocument,
      { type: 'property', id: 'og:description' },
      { type: 'name', id: 'description' }
    );

    expect(result).toEqual([]);
  });

  it('should handle case-insensitive attribute matching', () => {
    const mockMeta = { content: 'Test content' };
    mockDocument.querySelectorAll.mockReturnValue([mockMeta]);

    getMeta(mockDocument, { type: 'name', id: 'Description' });

    expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[name="Description" i]');
  });

  it('should handle different attribute types', () => {
    const mockMeta = { content: 'Twitter description' };
    mockDocument.querySelectorAll.mockReturnValue([mockMeta]);

    getMeta(mockDocument, { type: 'name', id: 'twitter:description' });

    expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[name="twitter:description" i]');
  });

  it('should handle property type meta tags', () => {
    const mockMeta = { content: 'OG description' };
    mockDocument.querySelectorAll.mockReturnValue([mockMeta]);

    getMeta(mockDocument, { type: 'property', id: 'og:description' });

    expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[property="og:description" i]');
  });

  it('should handle itemprop type meta tags', () => {
    const mockMeta = { content: 'Itemprop description' };
    mockDocument.querySelectorAll.mockReturnValue([mockMeta]);

    getMeta(mockDocument, { type: 'itemprop', id: 'description' });

    expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[itemprop="description" i]');
  });

  it('should handle http-equiv type meta tags', () => {
    const mockMeta = { content: 'HTTP-Equiv description' };
    mockDocument.querySelectorAll.mockReturnValue([mockMeta]);

    getMeta(mockDocument, { type: 'http-equiv', id: 'description' });

    expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[http-equiv="description" i]');
  });

  it('should handle rel type meta tags', () => {
    const mockMeta = { content: 'Search link' };
    mockDocument.querySelectorAll.mockReturnValue([mockMeta]);

    getMeta(mockDocument, { type: 'rel', id: 'search' });

    expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('[rel="search" i]');
  });

  it('should return first match and stop checking remaining types', () => {
    const mockMetas = [{ content: 'First match' }];
    mockDocument.querySelectorAll
      .mockReturnValueOnce([]) // First type - no match
      .mockReturnValueOnce(mockMetas); // Second type - match

    const result = getMeta(
      mockDocument,
      { type: 'property', id: 'og:description' },
      { type: 'name', id: 'description' },
      { type: 'name', id: 'twitter:description' } // Should not be checked
    );

    expect(result).toEqual(['First match']);
    expect(mockDocument.querySelectorAll).toHaveBeenCalledTimes(2);
  });

  it('should log debug information when DEBUG is enabled', () => {
    mockDocument.querySelectorAll.mockReturnValue([{ content: 'Test' }]);

    getMeta(mockDocument, { type: 'name', id: 'description' });

    // log is called with DEBUG=false by default, so it should be called
    expect(log).toHaveBeenCalled();
  });

  it('should handle empty content string in meta tag', () => {
    const mockMetas = [
      { content: '' },
      { content: 'Valid' },
    ];
    mockDocument.querySelectorAll.mockReturnValue(mockMetas);

    const result = getMeta(mockDocument, { type: 'name', id: 'description' });

    expect(result).toEqual(['Valid']);
  });

  it('should handle meta tag with null content', () => {
    const mockMetas = [
      { content: null },
      { content: 'Valid' },
    ];
    mockDocument.querySelectorAll.mockReturnValue(mockMetas);

    const result = getMeta(mockDocument, { type: 'name', id: 'description' });

    // Note: getMeta doesn't filter out null, it only filters out empty string and undefined
    expect(result).toEqual([null, 'Valid']);
  });

  it('should return all valid contents when multiple meta tags have valid content', () => {
    const mockMetas = [
      { content: 'First' },
      { content: '' },
      { content: 'Second' },
      { content: null },
      { content: 'Third' },
    ];
    mockDocument.querySelectorAll.mockReturnValue(mockMetas);

    const result = getMeta(mockDocument, { type: 'name', id: 'keywords' });

    // Note: getMeta filters out empty string and undefined, but not null
    expect(result).toEqual(['First', 'Second', null, 'Third']);
  });
});
