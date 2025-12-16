# Performance Optimization Tests

This directory contains comprehensive tests for the performance optimizations implemented in the Nextcloud Bookmarker extension.

## Test Coverage

### 1. Concurrency Tests
Tests rapid successive calls to ensure thread-safety and race condition prevention:
- ✅ URL normalization under concurrent load
- ✅ Similarity calculations without race conditions
- ✅ Option fetching with parallel requests

### 2. Memory Leak Tests
Validates proper memory management:
- ✅ URL cache respects 1000 entry limit
- ✅ Similarity cache respects 500 entry limit
- ✅ Options cache entries expire after TTL

### 3. Cache Collision Tests
Ensures cache keys don't collide:
- ✅ URLs with pipe characters
- ✅ Strings with double pipes
- ✅ Similar but distinct URLs

### 4. Abort Signal Tests
Validates request cancellation:
- ✅ Early stage abort
- ✅ Mid-processing abort
- ✅ Independent abort for deduplicated requests

### 5. Input Validation Tests
Ensures robust error handling:
- ✅ TypeError for invalid string arguments
- ✅ TypeError for invalid array arguments
- ✅ Graceful handling of mixed-type arrays

### 6. Load Tests
Performance under high volume:
- ✅ 1500+ bookmark similarity checks
- ✅ 10,000 rapid cache operations
- ✅ 5,000 URL normalizations

### 7. Edge Cases
Handling unusual inputs:
- ✅ Empty strings
- ✅ Very long strings (10,000+ chars)
- ✅ Special characters and Unicode
- ✅ Emoji handling

## Running Tests

### Install Dependencies
```bash
npm install --save-dev vitest @vitest/ui jsdom fake-indexeddb
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm test:watch
```

### Run Tests with Coverage
```bash
npm test:coverage
```

### Run Tests with UI
```bash
npm test:ui
```

## Test Results Interpretation

### Performance Benchmarks
Expected performance metrics:
- URL normalization (cached): < 0.05ms per call
- String similarity (cached): < 0.2ms per call
- Batch option fetch: < 10ms for 5 options
- 1500 bookmarks similarity: < 1000ms total

### Memory Limits
- URL cache: Max 1000 entries
- Similarity cache: Max 500 entries
- Options cache: 30 second TTL per option

### Concurrency
All operations should be thread-safe with no race conditions when running 100+ concurrent requests.

## Adding New Tests

When adding new performance features, add corresponding tests:

1. **Add test case** in appropriate `describe` block
2. **Use performance.now()** to measure timing
3. **Set reasonable thresholds** based on expected performance
4. **Log results** with console.log for visibility
5. **Test edge cases** including invalid inputs

Example:
```javascript
it('should handle new feature efficiently', () => {
  const startTime = performance.now();

  // Your test code here
  const result = myNewFeature();

  const endTime = performance.now();
  const duration = endTime - startTime;

  expect(result).toBeDefined();
  expect(duration).toBeLessThan(100); // 100ms threshold

  console.log(`✓ New feature completed in ${duration.toFixed(2)}ms`);
});
```

## Continuous Integration

These tests should be run:
- Before each commit
- In CI/CD pipeline
- Before releases
- After dependency updates

## Troubleshooting

### Tests Failing
1. Check Node.js version (requires 16+)
2. Ensure dependencies are installed
3. Clear cache: `npm test -- --clearCache`
4. Check for console errors

### Performance Degradation
If tests show slower performance:
1. Profile with `console.time()`
2. Check cache hit rates
3. Verify LRU eviction working
4. Monitor memory usage

## Related Documentation

- [Code Review](../CODE_REVIEW_PERFORMANCE.md) - Original performance review
- [Vitest Docs](https://vitest.dev/) - Testing framework
- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance) - Timing measurements
