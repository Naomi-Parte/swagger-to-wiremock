/**
 * @file Tests for extract-request-body.ts
 */

import { describe, it, expect } from 'vitest';
import { extractRequestBody } from '../../src/transformer/extract-request-body.js';

describe('extractRequestBody', () => {
  it('returns undefined when operation has no requestBody', () => {
    const operation = { responses: { '200': {} } };
    expect(extractRequestBody(operation)).toBeUndefined();
  });

  it('returns undefined when requestBody has no content', () => {
    const operation = { requestBody: { required: true } };
    expect(extractRequestBody(operation)).toBeUndefined();
  });

  it('returns undefined when content has no JSON media type', () => {
    const operation = {
      requestBody: {
        content: {
          'text/plain': { schema: { type: 'string' } },
        },
      },
    };
    expect(extractRequestBody(operation)).toBeUndefined();
  });

  it('returns undefined when JSON media type has no schema', () => {
    const operation = {
      requestBody: {
        content: {
          'application/json': {},
        },
      },
    };
    expect(extractRequestBody(operation)).toBeUndefined();
  });

  it('extracts schema from application/json request body', () => {
    const operation = {
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email'],
              properties: {
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                age: { type: 'integer' },
              },
            },
          },
        },
      },
    };

    const result = extractRequestBody(operation);
    expect(result).toBeDefined();
    expect(result!.contentType).toBe('application/json');
    expect(result!.required).toBe(true);
    expect(result!.requiredFields).toEqual(['name', 'email']);
    expect(result!.schema).toHaveProperty('type', 'object');
    expect(result!.schema).toHaveProperty('properties');
  });

  it('extracts from JSON-like content types (application/vnd.api+json)', () => {
    const operation = {
      requestBody: {
        content: {
          'application/vnd.api+json': {
            schema: {
              type: 'object',
              required: ['data'],
              properties: { data: { type: 'object' } },
            },
          },
        },
      },
    };

    const result = extractRequestBody(operation);
    expect(result).toBeDefined();
    expect(result!.contentType).toBe('application/vnd.api+json');
    expect(result!.requiredFields).toEqual(['data']);
  });

  it('returns empty requiredFields when schema has no required array', () => {
    const operation = {
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
      },
    };

    const result = extractRequestBody(operation);
    expect(result).toBeDefined();
    expect(result!.requiredFields).toEqual([]);
  });

  it('sets required to false when not specified', () => {
    const operation = {
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object' },
          },
        },
      },
    };

    const result = extractRequestBody(operation);
    expect(result).toBeDefined();
    expect(result!.required).toBe(false);
  });

  it('normalizes 3.1 type arrays in request body schema', () => {
    const operation = {
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                nickname: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    };

    const result = extractRequestBody(operation);
    expect(result).toBeDefined();
    const props = result!.schema.properties as Record<string, Record<string, unknown>>;
    expect(props.nickname.type).toBe('string'); // normalized from array
  });

  it('prefers application/json over other JSON-like types', () => {
    const operation = {
      requestBody: {
        content: {
          'application/vnd.custom+json': {
            schema: { type: 'object', required: ['custom'] },
          },
          'application/json': {
            schema: { type: 'object', required: ['standard'] },
          },
        },
      },
    };

    const result = extractRequestBody(operation);
    expect(result).toBeDefined();
    expect(result!.contentType).toBe('application/json');
    expect(result!.requiredFields).toEqual(['standard']);
  });
});
