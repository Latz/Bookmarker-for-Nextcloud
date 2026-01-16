/**
 * Unit tests for log.js
 * Tests the logging utility function
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import log from '../src/lib/log.js';

describe('log.js', () => {
  let consoleLogSpy;

  beforeEach(() => {
    // Spy on console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('When DEBUG is true', () => {
    it('should call console.log with the provided arguments', () => {
      log(true, 'test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('test message');
    });

    it('should pass multiple arguments to console.log', () => {
      log(true, 'message', 'arg1', 'arg2', 123);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('message', 'arg1', 'arg2', 123);
    });

    it('should handle empty arguments', () => {
      log(true);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith();
    });

    it('should handle various data types', () => {
      const obj = { key: 'value' };
      const arr = [1, 2, 3];
      log(true, 'string', 123, obj, arr, null, undefined);

      expect(consoleLogSpy).toHaveBeenCalledWith('string', 123, obj, arr, null, undefined);
    });

    it('should handle objects', () => {
      const data = { id: 1, name: 'test' };
      log(true, data);

      expect(consoleLogSpy).toHaveBeenCalledWith(data);
    });

    it('should handle arrays', () => {
      const items = ['a', 'b', 'c'];
      log(true, items);

      expect(consoleLogSpy).toHaveBeenCalledWith(items);
    });
  });

  describe('When DEBUG is false', () => {
    it('should not call console.log', () => {
      log(false, 'test message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not call console.log with multiple arguments', () => {
      log(false, 'message', 'arg1', 'arg2');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not call console.log even with empty arguments', () => {
      log(false);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('When DEBUG is truthy', () => {
    it('should log when DEBUG is 1', () => {
      log(1, 'test');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should log when DEBUG is a truthy string', () => {
      log('yes', 'test');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should log when DEBUG is an object', () => {
      log({}, 'test');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('When DEBUG is falsy', () => {
    it('should not log when DEBUG is 0', () => {
      log(0, 'test');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log when DEBUG is empty string', () => {
      log('', 'test');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log when DEBUG is null', () => {
      log(null, 'test');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log when DEBUG is undefined', () => {
      log(undefined, 'test');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle console.log errors gracefully', () => {
      consoleLogSpy.mockImplementation(() => {
        throw new Error('Console error');
      });

      // Should throw the error from console.log
      expect(() => log(true, 'test')).toThrow('Console error');
    });

    it('should work with complex nested objects', () => {
      const complex = {
        level1: {
          level2: {
            level3: ['a', 'b', { nested: true }]
          }
        }
      };
      log(true, complex);

      expect(consoleLogSpy).toHaveBeenCalledWith(complex);
    });

    it('should handle function arguments', () => {
      const fn = () => 'test';
      log(true, fn);

      expect(consoleLogSpy).toHaveBeenCalledWith(fn);
    });
  });
});
