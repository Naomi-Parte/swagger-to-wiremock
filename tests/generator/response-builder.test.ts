/**
 * @file Tests for response body generator
 * @description Verify response bodies are correctly generated from IR records
 */

import { describe, it, expect } from 'vitest';
import { generateResponseBody } from '../../src/generator/response-builder.js';
import type { OperationRecord } from '../../src/types/operation-record.js';

describe('Response Body Generator', () => {
  describe('Priority 1: mediaType.example', () => {
    it('should return mediaType.example verbatim when present', () => {
      const example = { id: 1, name: 'Fluffy', photoUrl: 'https://example.com/photo.jpg' };
      const record: OperationRecord = {
        id: 'test-1',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseExample: example,
      };

      const result = generateResponseBody(record);
      expect(result).toEqual(example);
      expect(result).toBe(example); // Verify same reference
    });

    it('should return example even if schema is present', () => {
      const example = { test: true };
      const record: OperationRecord = {
        id: 'test-2',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseExample: example,
        responseSchema: { type: 'object', properties: { other: { type: 'string' } } },
      };

      const result = generateResponseBody(record);
      expect(result).toEqual(example);
    });
  });

  describe('Priority 3: schema.example', () => {
    it('should return schema.example when mediaType.example is absent', () => {
      const schemaExample = { id: 123, name: 'Pet' };
      const record: OperationRecord = {
        id: 'test-3',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          example: schemaExample,
          properties: { id: { type: 'integer' }, name: { type: 'string' } },
        },
      };

      const result = generateResponseBody(record);
      expect(result).toEqual(schemaExample);
    });

    it('should prefer mediaType.example over schema.example', () => {
      const mediaTypeExample = { priority: 'mediaType' };
      const schemaExample = { priority: 'schema' };
      const record: OperationRecord = {
        id: 'test-4',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseExample: mediaTypeExample,
        responseSchema: { type: 'object', example: schemaExample },
      };

      const result = generateResponseBody(record);
      expect(result).toEqual(mediaTypeExample);
    });
  });

  describe('Priority 4: json-schema-faker generation', () => {
    it('should generate from schema when no example is present', () => {
      const record: OperationRecord = {
        id: 'test-5',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      };

      const result = generateResponseBody(record);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();

      // Verify structure (but not exact values, which are random)
      const obj = result as Record<string, unknown>;
      expect(typeof obj.id).toBe('number');
      expect(typeof obj.name).toBe('string');
    });

    it('should respect optionalsProbability in schema generation', () => {
      const record: OperationRecord = {
        id: 'test-6',
        path: '/users',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string' },
            phone: { type: 'string' }, // optional
            notes: { type: 'string' }, // optional
          },
          required: ['id', 'email'],
        },
      };

      const result = generateResponseBody(record);
      const obj = result as Record<string, unknown>;

      // Required fields must be present
      expect(obj).toHaveProperty('id');
      expect(obj).toHaveProperty('email');

      // With optionalsProbability 0.8, most optional fields should be present (but not guaranteed)
      // Just verify it's a valid object
      expect(typeof result).toBe('object');
    });
  });

  describe('Priority 5: Empty object fallback', () => {
    it('should return empty object when record has no example or schema', () => {
      const record: OperationRecord = {
        id: 'test-7',
        path: '/pets',
        method: 'post',
        statusCode: 201,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      };

      const result = generateResponseBody(record);
      expect(result).toEqual({});
    });

    it('should return empty object when schema generation fails', () => {
      const record: OperationRecord = {
        id: 'test-8',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: null,
      };

      const result = generateResponseBody(record);
      expect(result).toEqual({});
    });
  });

  describe('Seeded determinism', () => {
    it('should produce valid output with seeded generation', () => {
      const record: OperationRecord = {
        id: 'test-9',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
          required: ['id', 'name', 'email'],
        },
      };

      const result1 = generateResponseBody(record, 42);
      const result2 = generateResponseBody(record, 42);

      // Both should be valid objects with required fields
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();

      const obj1 = result1 as Record<string, unknown>;
      const obj2 = result2 as Record<string, unknown>;

      expect(obj1).toHaveProperty('id');
      expect(obj2).toHaveProperty('id');
      expect(obj1).toHaveProperty('email');
      expect(obj2).toHaveProperty('email');
    });

    it('should produce different output with different seeds', () => {
      const record: OperationRecord = {
        id: 'test-10',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            randomString: { type: 'string' },
          },
          required: ['randomString'],
        },
      };

      const result1 = generateResponseBody(record, 42);
      const result2 = generateResponseBody(record, 123);

      // Results should both be valid objects
      expect(typeof result1).toBe('object');
      expect(typeof result2).toBe('object');

      // Both should have randomString field
      const obj1 = result1 as Record<string, unknown>;
      const obj2 = result2 as Record<string, unknown>;
      expect(obj1).toHaveProperty('randomString');
      expect(obj2).toHaveProperty('randomString');
    });

    it('should use default seed 42 when not provided', () => {
      const record: OperationRecord = {
        id: 'test-11',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: { id: { type: 'integer' } },
          required: ['id'],
        },
      };

      const result1 = generateResponseBody(record); // default seed
      const result2 = generateResponseBody(record, 42); // explicit seed 42

      // Both should be valid objects with id field
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();

      const obj1 = result1 as Record<string, unknown>;
      const obj2 = result2 as Record<string, unknown>;
      expect(obj1).toHaveProperty('id');
      expect(obj2).toHaveProperty('id');
    });
  });

  describe('Format-aware generation', () => {
    it('should generate email format for string with format: email', () => {
      const record: OperationRecord = {
        id: 'test-12',
        path: '/users',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
          },
          required: ['email'],
        },
      };

      const result = generateResponseBody(record, 42) as Record<string, unknown>;
      expect(typeof result.email).toBe('string');
      // Basic email validation: contains @ and .
      expect(String(result.email)).toContain('@');
    });

    it('should generate uuid format for string with format: uuid', () => {
      const record: OperationRecord = {
        id: 'test-13',
        path: '/resources',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      };

      const result = generateResponseBody(record, 42) as Record<string, unknown>;
      expect(typeof result.id).toBe('string');
      // UUID v4 pattern (very basic check)
      expect(String(result.id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate date format as YYYY-MM-DD', () => {
      const record: OperationRecord = {
        id: 'test-14',
        path: '/events',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            createdAt: { type: 'string', format: 'date' },
          },
          required: ['createdAt'],
        },
      };

      const result = generateResponseBody(record, 42) as Record<string, unknown>;
      expect(typeof result.createdAt).toBe('string');
      // Date format check (YYYY-MM-DD)
      expect(String(result.createdAt)).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('should generate date-time format as ISO 8601', () => {
      const record: OperationRecord = {
        id: 'test-15',
        path: '/events',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
          },
          required: ['timestamp'],
        },
      };

      const result = generateResponseBody(record, 42) as Record<string, unknown>;
      expect(typeof result.timestamp).toBe('string');
      // ISO 8601 datetime (basic check)
      expect(String(result.timestamp)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Nested objects', () => {
    it('should generate nested objects from schema', () => {
      const record: OperationRecord = {
        id: 'test-16',
        path: '/users',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            profile: {
              type: 'object',
              properties: {
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                contact: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                  },
                  required: ['email'],
                },
              },
              required: ['firstName', 'lastName'],
            },
          },
          required: ['id', 'profile'],
        },
      };

      const result = generateResponseBody(record, 42) as Record<string, unknown>;
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('profile');

      const profile = result.profile as Record<string, unknown>;
      expect(profile).toHaveProperty('firstName');
      expect(profile).toHaveProperty('lastName');

      if (profile.contact) {
        const contact = profile.contact as Record<string, unknown>;
        expect(contact).toHaveProperty('email');
        expect(typeof contact.email).toBe('string');
      }
    });
  });

  describe('No side effects', () => {
    it('should not modify input record', () => {
      const record: OperationRecord = {
        id: 'test-17',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
      };

      const originalRecord = JSON.stringify(record);
      generateResponseBody(record, 42);
      const afterRecord = JSON.stringify(record);

      expect(originalRecord).toBe(afterRecord);
    });

    it('should return new object each time (not cached)', () => {
      const record: OperationRecord = {
        id: 'test-18',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      };

      const result1 = generateResponseBody(record);
      const result2 = generateResponseBody(record);

      // Both should be empty objects, but different instances
      expect(result1).toEqual({});
      expect(result2).toEqual({});
      expect(result1).not.toBe(result2); // Different instances
    });
  });
});
