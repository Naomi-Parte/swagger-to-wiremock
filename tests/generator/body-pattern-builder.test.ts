/**
 * @file Tests for body-pattern-builder.ts
 */

import { describe, it, expect } from 'vitest';
import { buildBodyPatterns } from '../../src/generator/body-pattern-builder.js';
import type { OperationRecord } from '../../src/types/operation-record.js';

function makeRecord(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    id: 'test-id',
    path: '/pets',
    method: 'post',
    statusCode: 201,
    pathParams: [],
    queryParams: [],
    headers: [],
    contentType: 'application/json',
    ...overrides,
  };
}

describe('buildBodyPatterns', () => {
  describe('method filtering', () => {
    it('returns undefined for GET requests', () => {
      const record = makeRecord({ method: 'get', requestBodySchema: { type: 'object' } });
      expect(buildBodyPatterns(record)).toBeUndefined();
    });

    it('returns undefined for DELETE requests', () => {
      const record = makeRecord({ method: 'delete', requestBodySchema: { type: 'object' } });
      expect(buildBodyPatterns(record)).toBeUndefined();
    });

    it('generates patterns for POST requests', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: { type: 'object', required: ['name'] },
        requestBodyRequiredFields: ['name'],
      });
      expect(buildBodyPatterns(record)).toBeDefined();
    });

    it('generates patterns for PUT requests', () => {
      const record = makeRecord({
        method: 'put',
        requestBodySchema: { type: 'object', required: ['name'] },
        requestBodyRequiredFields: ['name'],
      });
      expect(buildBodyPatterns(record)).toBeDefined();
    });

    it('generates patterns for PATCH requests', () => {
      const record = makeRecord({
        method: 'patch',
        requestBodySchema: { type: 'object', required: ['name'] },
        requestBodyRequiredFields: ['name'],
      });
      expect(buildBodyPatterns(record)).toBeDefined();
    });
  });

  describe('schema requirements', () => {
    it('returns undefined when no requestBodySchema', () => {
      const record = makeRecord({ method: 'post' });
      expect(buildBodyPatterns(record)).toBeUndefined();
    });

    it('returns undefined when no required fields', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: { type: 'object', properties: { name: { type: 'string' } } },
        requestBodyRequiredFields: [],
      });
      expect(buildBodyPatterns(record)).toBeUndefined();
    });

    it('returns undefined when requestBodyRequiredFields is undefined', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: { type: 'object' },
      });
      expect(buildBodyPatterns(record)).toBeUndefined();
    });
  });

  describe('pattern generation', () => {
    it('generates matchesJsonPath for each required field', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: {
          type: 'object',
          required: ['name', 'email'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            age: { type: 'integer' },
          },
        },
        requestBodyRequiredFields: ['name', 'email'],
      });

      const patterns = buildBodyPatterns(record);
      expect(patterns).toBeDefined();
      expect(patterns).toHaveLength(2);
      expect(patterns![0]).toEqual({ matchesJsonPath: '$.name' });
      expect(patterns![1]).toEqual({ matchesJsonPath: '$.email' });
    });

    it('generates patterns for a single required field', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
        requestBodyRequiredFields: ['id'],
      });

      const patterns = buildBodyPatterns(record);
      expect(patterns).toHaveLength(1);
      expect(patterns![0]).toEqual({ matchesJsonPath: '$.id' });
    });

    it('handles field names with special characters using bracket notation', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: {
          type: 'object',
          required: ['first-name', 'last.name'],
          properties: {
            'first-name': { type: 'string' },
            'last.name': { type: 'string' },
          },
        },
        requestBodyRequiredFields: ['first-name', 'last.name'],
      });

      const patterns = buildBodyPatterns(record);
      expect(patterns).toBeDefined();
      expect(patterns![0]).toEqual({ matchesJsonPath: "$['first-name']" });
      expect(patterns![1]).toEqual({ matchesJsonPath: "$['last.name']" });
    });
  });

  describe('nested required fields', () => {
    it('generates patterns for nested required fields one level deep', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: {
          type: 'object',
          required: ['address'],
          properties: {
            address: {
              type: 'object',
              required: ['street', 'city'],
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                zip: { type: 'string' },
              },
            },
          },
        },
        requestBodyRequiredFields: ['address'],
      });

      const patterns = buildBodyPatterns(record);
      expect(patterns).toBeDefined();
      // Should have: $.address + $.address.street + $.address.city
      expect(patterns).toContainEqual({ matchesJsonPath: '$.address' });
      expect(patterns).toContainEqual({ matchesJsonPath: '$.address.street' });
      expect(patterns).toContainEqual({ matchesJsonPath: '$.address.city' });
    });

    it('does not generate nested patterns for non-object properties', () => {
      const record = makeRecord({
        method: 'post',
        requestBodySchema: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
          },
        },
        requestBodyRequiredFields: ['name'],
      });

      const patterns = buildBodyPatterns(record);
      expect(patterns).toHaveLength(1);
      expect(patterns![0]).toEqual({ matchesJsonPath: '$.name' });
    });
  });
});
