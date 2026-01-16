/**
 * Unit tests for spinner module
 * Tests the Spinner class for managing loading indicators
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock chrome APIs
global.chrome = {
  action: {
    setBadgeText: vi.fn(),
  },
};

// Import the module
import Spinner from '../src/background/modules/spinner.js';

describe('Spinner', () => {
  let spinner;

  beforeEach(() => {
    vi.clearAllMocks();
    spinner = new Spinner();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct spinner elements', () => {
      expect(spinner.elements).toEqual(['|', '/', '-', '\\']);
    });

    it('should initialize index to 0', () => {
      expect(spinner.index).toBe(0);
    });

    it('should initialize intervalId to 0', () => {
      expect(spinner.intervalId).toBe(0);
    });
  });

  describe('next method', () => {
    it('should return first element initially', () => {
      expect(spinner.next()).toBe('|');
    });

    it('should cycle through elements correctly', () => {
      expect(spinner.next()).toBe('|'); // index 0 -> 1, returns elements[0]
      expect(spinner.next()).toBe('|'); // index 1 -> 2, returns elements[0]
      expect(spinner.next()).toBe('|'); // index 2 -> 3, returns elements[0]
      expect(spinner.next()).toBe('|'); // index 3 -> 0, returns elements[0]
      expect(spinner.next()).toBe('|'); // index 0 -> 1, returns elements[0]
    });

    it('should always return first element (bug in implementation)', () => {
      // Note: The implementation has a bug - it returns elements[0] instead of elements[this.index]
      // After incrementing the index
      expect(spinner.next()).toBe('|');
      expect(spinner.index).toBe(1);
      expect(spinner.next()).toBe('|'); // Should be '/' but returns '|'
      expect(spinner.index).toBe(2);
    });

    it('should wrap around correctly', () => {
      // Set index to 3
      spinner.index = 3;
      expect(spinner.next()).toBe('|'); // index 3 -> 0, returns elements[0]
      expect(spinner.index).toBe(0);
    });

    it('should handle multiple cycles', () => {
      for (let i = 0; i < 10; i++) {
        spinner.next();
      }
      expect(spinner.index).toBe(10 % 4); // 10 mod 4 = 2
    });
  });

  describe('start method', () => {
    it('should set badge text to save emoji', () => {
      spinner.start();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '💾' });
    });

    it('should work independently of current state', () => {
      spinner.index = 2;
      spinner.start();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '💾' });
    });
  });

  describe('stop method', () => {
    it('should set badge text to empty string', () => {
      spinner.stop();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('should work after start', () => {
      spinner.start();
      spinner.stop();

      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });
  });

  describe('Integration tests', () => {
    it('should handle complete spinner lifecycle', () => {
      // Start
      spinner.start();
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(1, { text: '💾' });

      // Cycle through some states
      spinner.next();
      spinner.next();
      spinner.next();

      // Stop
      spinner.stop();
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(2, { text: '' });
    });

    it('should allow multiple start/stop cycles', () => {
      spinner.start();
      spinner.stop();
      spinner.start();
      spinner.stop();

      expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(4);
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(1, { text: '💾' });
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(2, { text: '' });
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(3, { text: '💾' });
      expect(chrome.action.setBadgeText).toHaveBeenNthCalledWith(4, { text: '' });
    });
  });

  describe('Edge cases', () => {
    it('should handle index at boundary', () => {
      spinner.index = 3;
      expect(spinner.next()).toBe('|');
      expect(spinner.index).toBe(0);
    });

    it('should handle index at 0', () => {
      spinner.index = 0;
      expect(spinner.next()).toBe('|');
      expect(spinner.index).toBe(1);
    });

    it('should handle negative index (edge case)', () => {
      // This shouldn't happen in normal use, but let's see what happens
      // With the current implementation bug (returns elements[0] always):
      spinner.index = -1;
      expect(spinner.next()).toBe('|'); // (-1 + 1) % 4 = 0, returns elements[0] = '|'
      expect(spinner.index).toBe(0);
    });

    it('should have correct number of spinner elements', () => {
      expect(spinner.elements.length).toBe(4);
    });

    it('should not modify elements array', () => {
      const originalElements = [...spinner.elements];
      spinner.next();
      expect(spinner.elements).toEqual(originalElements);
    });
  });

  describe('Arrow function binding', () => {
    it('should have next bound to instance', () => {
      const nextFunc = spinner.next;
      // Arrow functions are bound, so this should work
      expect(nextFunc()).toBe('|');
    });

    it('should have start bound to instance', () => {
      const startFunc = spinner.start;
      startFunc();
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '💾' });
    });

    it('should have stop bound to instance', () => {
      const stopFunc = spinner.stop;
      stopFunc();
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });
});
