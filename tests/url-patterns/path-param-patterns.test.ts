/**
 * @file Tests for path parameter patterns
 * @description Verify regex patterns for different parameter types and formats
 */

import { describe, it, expect } from 'vitest';
import { PATH_PARAM_PATTERNS, getPathParamPattern } from '../../src/url-patterns/path-param-patterns.ts';

describe('Path Parameter Patterns', () => {
  describe('PATH_PARAM_PATTERNS constant', () => {
    it('should export patterns for all type/format combinations', () => {
      expect(PATH_PARAM_PATTERNS).toHaveProperty('string');
      expect(PATH_PARAM_PATTERNS).toHaveProperty('string:uuid');
      expect(PATH_PARAM_PATTERNS).toHaveProperty('string:date');
      expect(PATH_PARAM_PATTERNS).toHaveProperty('integer');
      expect(PATH_PARAM_PATTERNS).toHaveProperty('number:float');
      expect(PATH_PARAM_PATTERNS).toHaveProperty('boolean');
    });

    it('should have valid regex patterns for each entry', () => {
      Object.entries(PATH_PARAM_PATTERNS).forEach(([key, pattern]) => {
        // Should not throw when compiling regex
        expect(() => new RegExp(pattern)).not.toThrow();
      });
    });
  });

  describe('getPathParamPattern', () => {
    it('should return default string pattern when type is undefined', () => {
      const result = getPathParamPattern();
      expect(result).toBe('[^/]+');
    });

    it('should return default string pattern when type is unknown', () => {
      const result = getPathParamPattern('unknown', undefined);
      expect(result).toBe('[^/]+');
    });

    describe('UUID format', () => {
      it('should match uuid format for string type', () => {
        const result = getPathParamPattern('string', 'uuid');
        expect(result).toBe('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');

        // Test sample UUIDs
        const regex = new RegExp(`^${result}$`, 'i');
        expect(regex.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(regex.test('invalid')).toBe(false);
      });
    });

    describe('Date format', () => {
      it('should match date format YYYY-MM-DD', () => {
        const result = getPathParamPattern('string', 'date');
        expect(result).toBe('\\d{4}-\\d{2}-\\d{2}');

        const regex = new RegExp(`^${result}$`);
        expect(regex.test('2025-08-05')).toBe(true);
        expect(regex.test('2025-13-01')).toBe(true); // Regex doesn't validate month/day ranges
        expect(regex.test('05-08-2025')).toBe(false);
      });
    });

    describe('DateTime format', () => {
      it('should match ISO 8601 datetime', () => {
        const result = getPathParamPattern('string', 'date-time');
        // Note: Contains %3A for URL-encoded colons
        expect(result).toContain('%3A');
      });
    });

    describe('Email format', () => {
      it('should match email addresses', () => {
        const result = getPathParamPattern('string', 'email');
        expect(result).toBe('[^/]+@[^/]+\\.[^/]+');

        const regex = new RegExp(`^${result}$`);
        expect(regex.test('user@example.com')).toBe(true);
        expect(regex.test('user')).toBe(false);
      });
    });

    describe('Integer type', () => {
      it('should match integers by default', () => {
        const result = getPathParamPattern('integer');
        expect(result).toBe('[0-9]+');

        const regex = new RegExp(`^${result}$`);
        expect(regex.test('123')).toBe(true);
        expect(regex.test('0')).toBe(true);
        expect(regex.test('-5')).toBe(false); // Negative numbers not matched
      });

      it('should match int32 format', () => {
        const result = getPathParamPattern('integer', 'int32');
        expect(result).toBe('[0-9]+');
      });

      it('should match int64 format', () => {
        const result = getPathParamPattern('integer', 'int64');
        expect(result).toBe('[0-9]+');
      });
    });

    describe('Number type', () => {
      it('should match decimal numbers', () => {
        const result = getPathParamPattern('number');
        expect(result).toBe('[-]?[0-9]*\\.?[0-9]+');

        const regex = new RegExp(`^${result}$`);
        expect(regex.test('123')).toBe(true);
        expect(regex.test('123.45')).toBe(true);
        expect(regex.test('-123.45')).toBe(true);
        expect(regex.test('.5')).toBe(true);
      });

      it('should match float format', () => {
        const result = getPathParamPattern('number', 'float');
        expect(result).toBe('[-]?[0-9]*\\.?[0-9]+');
      });

      it('should match double format', () => {
        const result = getPathParamPattern('number', 'double');
        expect(result).toBe('[-]?[0-9]*\\.?[0-9]+');
      });
    });

    describe('Boolean type', () => {
      it('should match true or false', () => {
        const result = getPathParamPattern('boolean');
        expect(result).toBe('(true|false)');

        const regex = new RegExp(`^${result}$`);
        expect(regex.test('true')).toBe(true);
        expect(regex.test('false')).toBe(true);
        expect(regex.test('True')).toBe(false); // Case-sensitive
        expect(regex.test('1')).toBe(false);
      });
    });

    describe('String type', () => {
      it('should default to [^/]+ for unformatted strings', () => {
        const result = getPathParamPattern('string');
        expect(result).toBe('[^/]+');

        const regex = new RegExp(`^${result}$`);
        expect(regex.test('anything')).toBe(true);
        expect(regex.test('with-dashes')).toBe(true);
        expect(regex.test('with/slashes')).toBe(false); // Slashes not allowed
      });
    });
  });
});
