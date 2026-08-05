/**
 * @file Tests for BaseError class
 */

import { describe, it, expect } from 'vitest';
import { BaseError } from '../../src/errors/base-error.js';

describe('BaseError', () => {
  it('should create error with code and message', () => {
    const error = new BaseError('TEST_ERROR', 'Test message');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
  });

  it('should include context when provided', () => {
    const context = { filePath: './spec.yaml' };
    const error = new BaseError('FILE_ERROR', 'File not found', context);
    expect(error.context).toEqual(context);
  });

  it('should convert to JSON with all fields', () => {
    const error = new BaseError('ERR', 'Message', { extra: 'data' });
    const json = error.toJSON();
    expect(json.code).toBe('ERR');
    expect(json.message).toBe('Message');
    expect(json.context).toEqual({ extra: 'data' });
    expect(json.name).toBe('BaseError');
  });

  it('should work as instanceof Error', () => {
    const error = new BaseError('ERR', 'Test');
    expect(error instanceof Error).toBe(true);
  });
});
