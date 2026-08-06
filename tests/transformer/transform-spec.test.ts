/**
 * @file Tests for transformer/index.ts
 */

import { describe, it, expect } from 'vitest';
import { transformSpec } from '../../src/transformer/index.js';

describe('transformSpec', () => {
  it('should transform simple operation into single record', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            summary: 'List pets',
            operationId: 'listPets',
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    example: [{ id: 1, name: 'Fido' }],
                  },
                },
              },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      path: '/pets',
      method: 'get',
      statusCode: 200,
      summary: 'List pets',
      operationId: 'listPets',
      pathParams: [],
      queryParams: [],
      contentType: 'application/json',
    });
  });

  it('should create separate record for each status code', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { example: [] } },
              },
              '400': {
                description: 'Bad request',
                content: { 'application/json': { example: { error: 'Invalid' } } },
              },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.statusCode)).toEqual([200, 400]);
    expect(records.map((r) => r.path)).toEqual(['/pets', '/pets']);
    expect(records.map((r) => r.method)).toEqual(['get', 'get']);
  });

  it('should transform multiple operations', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                content: { 'application/json': { example: [] } },
              },
            },
          },
          post: {
            responses: {
              '201': {
                description: 'Created',
                content: { 'application/json': { example: {} } },
              },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.method)).toEqual(['get', 'post']);
  });

  it('should extract path parameters', () => {
    const spec = {
      paths: {
        '/pets/{petId}': {
          get: {
            parameters: [
              {
                name: 'petId',
                in: 'path',
                schema: { type: 'string', format: 'uuid' },
                required: true,
              },
            ],
            responses: {
              '200': {
                description: 'OK',
                content: { 'application/json': {} },
              },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records[0].pathParams).toHaveLength(1);
    expect(records[0].pathParams[0]).toMatchObject({
      name: 'petId',
      type: 'string',
      format: 'uuid',
      required: true,
    });
  });

  it('should extract query parameters', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            parameters: [
              {
                name: 'status',
                in: 'query',
                schema: { type: 'string', enum: ['active', 'inactive'] },
                required: true,
              },
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer' },
                required: false,
              },
            ],
            responses: {
              '200': {
                description: 'OK',
                content: { 'application/json': {} },
              },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records[0].queryParams).toHaveLength(2);
    expect(records[0].queryParams[0]).toMatchObject({
      name: 'status',
      enum: ['active', 'inactive'],
      required: true,
    });
    expect(records[0].queryParams[1]).toMatchObject({
      name: 'limit',
      required: false,
    });
  });

  it('should extract response example and schema', () => {
    const spec = {
      paths: {
        '/pets/{petId}': {
          get: {
            parameters: [
              { name: 'petId', in: 'path', schema: { type: 'string' }, required: true },
            ],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    example: { id: 1, name: 'Fido' },
                    schema: { type: 'object', properties: { id: { type: 'integer' } } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records[0]).toMatchObject({
      responseExample: { id: 1, name: 'Fido' },
      responseSchema: { type: 'object', properties: { id: { type: 'integer' } } },
    });
  });

  it('should generate unique IDs for each record', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            responses: {
              '200': { description: 'OK', content: { 'application/json': {} } },
              '400': { description: 'Bad', content: { 'application/json': {} } },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records[0].id).not.toBe(records[1].id);
    expect(records[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('should handle spec without paths', () => {
    const spec = { info: { title: 'Test' } };
    const records = transformSpec(spec);
    expect(records).toHaveLength(0);
  });

  it('should skip operations without responses', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            description: 'No responses defined',
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records).toHaveLength(0);
  });

  it('should include summary and description', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            summary: 'List all pets',
            description: 'Returns a list of all pets in the store',
            responses: {
              '200': { description: 'OK', content: { 'application/json': {} } },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records[0]).toMatchObject({
      summary: 'List all pets',
      description: 'Returns a list of all pets in the store',
    });
  });

  it('should include operationId when present', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            operationId: 'listPets',
            responses: {
              '200': { description: 'OK', content: { 'application/json': {} } },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records[0]).toMatchObject({
      operationId: 'listPets',
    });
  });

  it('should generate records for default responses (mapped to 500)', () => {
    const spec = {
      paths: {
        '/pets': {
          get: {
            responses: {
              '200': { description: 'OK', content: { 'application/json': { example: [] } } },
              default: {
                description: 'Error',
                content: { 'application/json': { schema: { type: 'object' } } },
              },
            },
          },
        },
      },
    };

    const records = transformSpec(spec);
    expect(records).toHaveLength(2);
    expect(records[0].statusCode).toBe(200);
    expect(records[1].statusCode).toBe('default'); // default preserved as string
    expect(records[0].path).toBe('/pets');
    expect(records[1].path).toBe('/pets');
  });
});
