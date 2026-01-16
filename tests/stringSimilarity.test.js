/**
 * Unit tests for stringSimilarity.js
 * Tests Jaro-Winkler similarity algorithm, caching, and batch operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateSimilarity,
  isSimilar,
  findMostSimilar,
  batchSimilarityCheck,
  clearSimilarityCache,
} from '../src/lib/stringSimilarity.js';

describe('stringSimilarity.js', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearSimilarityCache();
  });

  describe('calculateSimilarity', () => {
    describe('Input validation', () => {
      it('should throw TypeError when first argument is not a string', () => {
        expect(() => calculateSimilarity(123, 'test')).toThrow(TypeError);
        expect(() => calculateSimilarity(null, 'test')).toThrow(TypeError);
        expect(() => calculateSimilarity(undefined, 'test')).toThrow(TypeError);
        expect(() => calculateSimilarity({}, 'test')).toThrow(TypeError);
      });

      it('should throw TypeError when second argument is not a string', () => {
        expect(() => calculateSimilarity('test', 123)).toThrow(TypeError);
        expect(() => calculateSimilarity('test', null)).toThrow(TypeError);
        expect(() => calculateSimilarity('test', undefined)).toThrow(TypeError);
        expect(() => calculateSimilarity('test', {})).toThrow(TypeError);
      });

      it('should throw error with descriptive message', () => {
        try {
          calculateSimilarity(123, 'test');
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error.message).toContain('Both arguments must be strings');
          expect(error.message).toContain('str1=number');
        }
      });
    });

    describe('Basic similarity', () => {
      it('should return 1.0 for identical strings', () => {
        expect(calculateSimilarity('test', 'test')).toBe(1.0);
        expect(calculateSimilarity('', '')).toBe(1.0);
      });

      it('should return 0.0 for completely different strings', () => {
        expect(calculateSimilarity('abc', 'xyz')).toBe(0.0);
      });

      it('should handle empty strings', () => {
        expect(calculateSimilarity('', 'test')).toBe(0.0);
        expect(calculateSimilarity('test', '')).toBe(0.0);
      });
    });

    describe('Case sensitivity', () => {
      it('should be case-insensitive by default', () => {
        expect(calculateSimilarity('Test', 'test')).toBe(1.0);
        expect(calculateSimilarity('HELLO', 'hello')).toBe(1.0);
      });

      it('should be case-sensitive when option is set', () => {
        expect(calculateSimilarity('Test', 'test', { caseSensitive: true })).toBeLessThan(1.0);
        expect(calculateSimilarity('HELLO', 'hello', { caseSensitive: true })).toBeLessThan(1.0);
      });
    });

    describe('Trimming', () => {
      it('should trim whitespace by default', () => {
        expect(calculateSimilarity('  test  ', 'test')).toBe(1.0);
        expect(calculateSimilarity('test', '  test  ')).toBe(1.0);
      });

      it('should not trim when trim option is false', () => {
        expect(calculateSimilarity('  test  ', 'test', { trim: false })).toBeLessThan(1.0);
      });
    });

    describe('Similarity scores', () => {
      it('should calculate high similarity for similar strings', () => {
        const score = calculateSimilarity('kitten', 'sitting');
        expect(score).toBeGreaterThan(0.7);
        expect(score).toBeLessThan(0.8);
      });

      it('should calculate moderate similarity for related strings', () => {
        const score = calculateSimilarity('book', 'books');
        expect(score).toBeGreaterThan(0.8);
      });

      it('should calculate high similarity for strings with common prefix', () => {
        const score = calculateSimilarity('application', 'applicative');
        expect(score).toBeGreaterThan(0.85);
      });

      it('should handle transpositions correctly', () => {
        const score = calculateSimilarity('ab', 'ba');
        expect(score).toBeGreaterThan(0.6);
      });
    });

    describe('Caching', () => {
      it('should cache results for faster subsequent calls', () => {
        const str1 = 'test string one';
        const str2 = 'test string two';

        // First call - computes similarity
        const result1 = calculateSimilarity(str1, str2);

        // Second call - should use cache
        const result2 = calculateSimilarity(str1, str2);

        expect(result1).toBe(result2);
      });

      it('should cache based on normalized strings', () => {
        // These should produce the same normalized strings
        const result1 = calculateSimilarity('  TEST  ', 'test');
        const result2 = calculateSimilarity('Test', 'TEST');

        expect(result1).toBe(result2);
      });

      it('should handle LRU eviction when cache is full', () => {
        // Fill cache with 501 unique pairs
        for (let i = 0; i < 501; i++) {
          calculateSimilarity(`string${i}`, `string${i}x`);
        }

        // First entry should be evicted
        const result = calculateSimilarity('string0', 'string0x');
        expect(result).toBeDefined();
      });
    });

    describe('Threshold option', () => {
      it('should use threshold for pre-filtering optimization', () => {
        // With threshold, similar strings should still be calculated
        const score = calculateSimilarity('test', 'test', { threshold: 0.5 });
        expect(score).toBe(1.0);
      });
    });

    describe('Edge cases', () => {
      it('should handle single character strings', () => {
        expect(calculateSimilarity('a', 'a')).toBe(1.0);
        expect(calculateSimilarity('a', 'b')).toBe(0.0);
      });

      it('should handle very long strings', () => {
        const long1 = 'a'.repeat(1000);
        const long2 = 'a'.repeat(999) + 'b';
        const score = calculateSimilarity(long1, long2);
        expect(score).toBeGreaterThan(0.99);
      });

      it('should handle strings with special characters', () => {
        expect(calculateSimilarity('test@#$%', 'test@#$%')).toBe(1.0);
      });

      it('should handle unicode characters', () => {
        expect(calculateSimilarity('café', 'café')).toBe(1.0);
        expect(calculateSimilarity('日本語', '日本語')).toBe(1.0);
      });
    });
  });

  describe('isSimilar', () => {
    describe('Input validation', () => {
      it('should throw TypeError when first argument is not a string', () => {
        expect(() => isSimilar(123, 'test')).toThrow(TypeError);
      });

      it('should throw TypeError when second argument is not a string', () => {
        expect(() => isSimilar('test', 123)).toThrow(TypeError);
      });
    });

    describe('Similarity threshold', () => {
      it('should return true when similarity exceeds threshold', () => {
        expect(isSimilar('kitten', 'sitting', 0.7)).toBe(true);
      });

      it('should return false when similarity is below threshold', () => {
        expect(isSimilar('abc', 'xyz', 0.5)).toBe(false);
      });

      it('should use default threshold of 0.75', () => {
        expect(isSimilar('book', 'books')).toBe(true);
        expect(isSimilar('completely', 'different')).toBe(false);
      });
    });

    describe('Options', () => {
      it('should pass options to calculateSimilarity', () => {
        expect(isSimilar('TEST', 'test', 0.5, { caseSensitive: true })).toBe(false);
        expect(isSimilar('TEST', 'test', 0.5, { caseSensitive: false })).toBe(true);
      });
    });
  });

  describe('findMostSimilar', () => {
    describe('Input validation', () => {
      it('should throw TypeError when target is not a string', () => {
        expect(() => findMostSimilar(123, ['test'])).toThrow(TypeError);
      });

      it('should throw TypeError when candidates is not an array', () => {
        expect(() => findMostSimilar('test', 'not-an-array')).toThrow(TypeError);
      });
    });

    describe('Finding best match', () => {
      it('should find the most similar string from candidates', () => {
        const target = 'kitten';
        const candidates = ['sitting', 'sunday', 'mitten', 'kitchen'];
        const result = findMostSimilar(target, candidates);

        expect(result).not.toBeNull();
        expect(candidates).toContain(result.value);
        expect(result.score).toBeGreaterThan(0.7);
      });

      it('should return null when no match exceeds threshold', () => {
        const target = 'completely';
        const candidates = ['different', 'words', 'here'];
        const result = findMostSimilar(target, candidates, 0.9);

        expect(result).toBeNull();
      });

      it('should handle empty candidates array', () => {
        const result = findMostSimilar('test', []);
        expect(result).toBeNull();
      });

      it('should skip non-string candidates', () => {
        const target = 'test';
        const candidates = ['test', 123, null, 'testing', undefined];
        const result = findMostSimilar(target, candidates);

        expect(result).not.toBeNull();
        expect(result.value).toBe('test');
      });
    });

    describe('Early exit optimization', () => {
      it('should exit early on near-perfect match', () => {
        const target = 'exact match';
        const candidates = ['exact match', 'similar', 'different'];
        const result = findMostSimilar(target, candidates);

        expect(result).not.toBeNull();
        expect(result.value).toBe('exact match');
        expect(result.score).toBe(1.0);
      });
    });

    describe('Threshold', () => {
      it('should use custom threshold', () => {
        const target = 'test';
        const candidates = ['test', 'testing', 'completely'];
        const result = findMostSimilar(target, candidates, 0.95);

        expect(result).not.toBeNull();
        expect(result.value).toBe('test');
      });
    });

    describe('Options', () => {
      it('should pass options to calculateSimilarity', () => {
        const target = 'TEST';
        const candidates = ['test', 'TESTING'];
        const result = findMostSimilar(target, candidates, 0.5, { caseSensitive: true });

        expect(result).not.toBeNull();
        expect(result.value).toBe('TESTING');
      });
    });
  });

  describe('batchSimilarityCheck', () => {
    describe('Input validation', () => {
      it('should throw TypeError when target is not a string', () => {
        expect(() => batchSimilarityCheck(123, [{ title: 'test' }])).toThrow(TypeError);
      });

      it('should throw TypeError when candidates is not an array', () => {
        expect(() => batchSimilarityCheck('test', 'not-an-array')).toThrow(TypeError);
      });
    });

    describe('Batch processing', () => {
      it('should return all matches above threshold', () => {
        const target = 'test';
        const candidates = [
          { id: 1, title: 'test' },
          { id: 2, title: 'testing' },
          { id: 3, title: 'completely different' },
        ];
        const results = batchSimilarityCheck(target, candidates, 0.5);

        // At least 'test' should match
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.map(r => r.id)).toContain(1);
      });

      it('should return empty array when no matches exceed threshold', () => {
        const target = 'test';
        const candidates = [
          { id: 1, title: 'completely' },
          { id: 2, title: 'different' },
        ];
        const results = batchSimilarityCheck(target, candidates, 0.9);

        expect(results).toHaveLength(0);
      });

      it('should skip candidates without title property', () => {
        const target = 'test';
        const candidates = [
          { id: 1, title: 'test' },
          { id: 2 }, // No title
          { id: 3, title: null },
          { id: 4, title: 'testing' },
        ];
        const results = batchSimilarityCheck(target, candidates, 0.5);

        // Should only return candidates with valid titles that exceed threshold
        // At least 'test' should match
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.map(r => r.id)).toContain(1);
        // Should not include candidates without valid titles
        expect(results.map(r => r.id)).not.toContain(2);
        expect(results.map(r => r.id)).not.toContain(3);
      });

      it('should skip candidates with non-string titles', () => {
        const target = 'test';
        const candidates = [
          { id: 1, title: 'test' },
          { id: 2, title: 123 },
          { id: 3, title: 'testing' },
        ];
        const results = batchSimilarityCheck(target, candidates, 0.5);

        // Should only return candidates with string titles that exceed threshold
        // At least 'test' should match
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.map(r => r.id)).toContain(1);
        // Should not include candidates with non-string titles
        expect(results.map(r => r.id)).not.toContain(2);
      });
    });

    describe('Similarity scores', () => {
      it('should include similarity score in results', () => {
        const target = 'test';
        const candidates = [{ id: 1, title: 'test' }];
        const results = batchSimilarityCheck(target, candidates, 0.5);

        expect(results[0]).toHaveProperty('similarity');
        expect(results[0].similarity).toBe(1.0);
      });

      it('should preserve original candidate properties', () => {
        const target = 'test';
        const candidates = [{ id: 1, title: 'test', custom: 'value' }];
        const results = batchSimilarityCheck(target, candidates, 0.5);

        expect(results[0].id).toBe(1);
        expect(results[0].title).toBe('test');
        expect(results[0].custom).toBe('value');
      });
    });

    describe('Sorting', () => {
      it('should sort results by similarity (highest first)', () => {
        const target = 'test';
        const candidates = [
          { id: 1, title: 'testing' },
          { id: 2, title: 'test' },
          { id: 3, title: 'tests' },
        ];
        const results = batchSimilarityCheck(target, candidates, 0.5);

        // Verify results are sorted by similarity (highest first)
        expect(results.length).toBeGreaterThanOrEqual(2);
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
        }
      });
    });

    describe('Early exit', () => {
      it('should exit early on perfect match', () => {
        const target = 'exact match';
        const candidates = [
          { id: 1, title: 'exact match' },
          { id: 2, title: 'similar' },
          { id: 3, title: 'different' },
        ];
        const results = batchSimilarityCheck(target, candidates, 0.5);

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(1);
        expect(results[0].similarity).toBe(1.0);
      });
    });

    describe('Options', () => {
      it('should pass options to calculateSimilarity', () => {
        const target = 'TEST';
        const candidates = [
          { id: 1, title: 'test' },
          { id: 2, title: 'TESTING' },
        ];
        const results = batchSimilarityCheck(target, candidates, 0.5, { caseSensitive: true });

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(2);
      });
    });
  });

  describe('clearSimilarityCache', () => {
    it('should clear the cache', () => {
      // Populate cache
      calculateSimilarity('test1', 'test1x');
      calculateSimilarity('test2', 'test2x');

      // Clear cache
      clearSimilarityCache();

      // Should recompute (we can't directly verify cache is empty,
      // but we can verify the function doesn't throw)
      expect(() => clearSimilarityCache()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      clearSimilarityCache();
      clearSimilarityCache();
      clearSimilarityCache();
    });
  });

  describe('Performance considerations', () => {
    it('should handle many similarity calculations efficiently', () => {
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        calculateSimilarity(`test string ${i}`, `test string ${i}x`);
      }
      const end = Date.now();
      const duration = end - start;

      // Should complete in reasonable time (less than 1 second for 100 calculations)
      expect(duration).toBeLessThan(1000);
    });

    it('should benefit from caching for repeated calculations', () => {
      const str1 = 'test string';
      const str2 = 'test string x';

      // First calculation
      calculateSimilarity(str1, str2);

      // Many cached calculations should be fast
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        calculateSimilarity(str1, str2);
      }
      const end = Date.now();
      const duration = end - start;

      // Should be very fast due to caching
      expect(duration).toBeLessThan(100);
    });
  });
});
