// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  timeoutMilliseconds,
  clampTimeoutSetting,
} from '../../src/lib/networkTimeout.js';

describe('timeoutMilliseconds (what apiCall uses)', () => {
  it('converts seconds to milliseconds', () => {
    expect(timeoutMilliseconds(30)).toBe(30000);
  });

  it('keeps fractions', () => {
    expect(timeoutMilliseconds(0.01)).toBe(10);
  });

  it.each([undefined, null, false, '', 'abc', NaN, 0, -5, -0.5, Infinity])(
    'falls back to 10 s for %j',
    (value) => {
      // A negative timeout would abort every request immediately.
      expect(timeoutMilliseconds(value)).toBe(10000);
    },
  );

  it('caps an enormous value at 120 s', () => {
    expect(timeoutMilliseconds(1_000_000)).toBe(120000);
  });
});

describe('clampTimeoutSetting (what the options page stores)', () => {
  it.each([
    ['45', 45],
    [45, 45],
    ['0', 1],
    ['-3', 1],
    ['9999', 120],
    ['7.9', 7],
  ])('%j -> %i', (input, expected) => {
    expect(clampTimeoutSetting(input)).toBe(expected);
  });

  it.each(['', 'abc', undefined, null])('%j is not stored', (input) => {
    expect(clampTimeoutSetting(input)).toBeNull();
  });
});
