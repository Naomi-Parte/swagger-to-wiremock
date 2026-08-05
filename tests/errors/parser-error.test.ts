/**
 * @file Tests for ParserError class
 */

import { describe, it, expect } from 'vitest';
import { ParserError } from '../../src/errors/parser-error.js';

describe('ParserError', () => {
  it('should create error with valid code', () => {
    const error = new ParserError('INVALID_FILE', 'File not found');
    expect(error.code).toBe('INVALID_FILE');
    expect(error.message).toBe('File not found');
  });

  it('should support all valid error codes', () => {
    const codes: Array<
      'INVALID_FILE' | 'INVALID_SPEC' | 'UNSUPPORTED_VERSION' | 'CIRCULAR_REF' | 'PARSE_ERROR'
    > = ['INVALID_FILE', 'INVALID_SPEC', 'UNSUPPORTED_VERSION', 'CIRCULAR_REF', 'PARSE_ERROR'];

    codes.forEach((code) => {
      const error = new ParserError(code, `Error with ${code}`);
      expect(error.code).toBe(code);
    });
  });

  it('should extend BaseError', () => {
    const error = new ParserError('INVALID_SPEC', 'Bad spec');
    expect(error instanceof Error).toBe(true);
  });

  it('should include context', () => {
    const error = new ParserError('UNSUPPORTED_VERSION', 'Version not supported', {
      version: '2.0',
    });
    expect(error.context).toEqual({ version: '2.0' });
  });
});
