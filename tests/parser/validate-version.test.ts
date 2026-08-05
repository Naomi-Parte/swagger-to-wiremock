/**
 * @file Tests for validate-version.ts
 */

import { describe, it, expect } from 'vitest';
import { validateOpenAPIVersion } from '../../src/parser/validate-version.js';
import { ParserError } from '../../src/errors/parser-error.js';

describe('validateOpenAPIVersion', () => {
  it('should accept OpenAPI 3.0.0', () => {
    const spec = { openapi: '3.0.0' };
    expect(validateOpenAPIVersion(spec)).toBe('3.0.0');
  });

  it('should accept OpenAPI 3.0.1', () => {
    const spec = { openapi: '3.0.1' };
    expect(validateOpenAPIVersion(spec)).toBe('3.0.1');
  });

  it('should accept OpenAPI 3.0.2', () => {
    const spec = { openapi: '3.0.2' };
    expect(validateOpenAPIVersion(spec)).toBe('3.0.2');
  });

  it('should accept OpenAPI 3.0.3', () => {
    const spec = { openapi: '3.0.3' };
    expect(validateOpenAPIVersion(spec)).toBe('3.0.3');
  });

  it('should reject Swagger 2.0 with specific message', () => {
    const spec = { swagger: '2.0' };
    expect(() => validateOpenAPIVersion(spec)).toThrow(ParserError);
    try {
      validateOpenAPIVersion(spec);
    } catch (error) {
      expect((error as ParserError).code).toBe('UNSUPPORTED_VERSION');
      expect((error as ParserError).message).toContain('Swagger 2.0');
    }
  });

  it('should reject OpenAPI 3.1.0 with specific message', () => {
    const spec = { openapi: '3.1.0' };
    expect(() => validateOpenAPIVersion(spec)).toThrow(ParserError);
    try {
      validateOpenAPIVersion(spec);
    } catch (error) {
      expect((error as ParserError).code).toBe('UNSUPPORTED_VERSION');
      expect((error as ParserError).message).toContain('3.1');
    }
  });

  it('should reject OpenAPI 3.1.1 with specific message', () => {
    const spec = { openapi: '3.1.1' };
    expect(() => validateOpenAPIVersion(spec)).toThrow(ParserError);
    try {
      validateOpenAPIVersion(spec);
    } catch (error) {
      expect((error as ParserError).code).toBe('UNSUPPORTED_VERSION');
      expect((error as ParserError).message).toContain('3.1');
    }
  });

  it('should reject missing version field', () => {
    const spec = { info: { title: 'Test' } };
    expect(() => validateOpenAPIVersion(spec)).toThrow(ParserError);
    try {
      validateOpenAPIVersion(spec);
    } catch (error) {
      expect((error as ParserError).code).toBe('INVALID_SPEC');
    }
  });

  it('should include version info in context', () => {
    const spec = { swagger: '2.0' };
    try {
      validateOpenAPIVersion(spec);
    } catch (error) {
      expect((error as ParserError).context?.version).toBe('2.0');
      expect((error as ParserError).context?.major).toBe(2);
    }
  });
});
