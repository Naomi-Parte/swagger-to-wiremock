import { describe, expect, it } from 'vitest';
import { generateMappings } from '../../src/generator/index.js';
import type { OperationRecord } from '../../src/types/operation-record.js';

describe('generateMappings', () => {
  it('generates a mapping with request, response, and metadata', () => {
    const records: OperationRecord[] = [
      {
        id: 'op-1',
        path: '/pets/{petId}',
        method: 'get',
        statusCode: 200,
        summary: 'Get pet',
        operationId: 'showPetById',
        pathParams: [{ name: 'petId', type: 'string', format: 'uuid', required: true }],
        queryParams: [
          { name: 'status', type: 'string', required: true, enum: ['available', 'pending', 'sold'] },
          { name: 'limit', type: 'integer', required: false },
        ],
        headers: [],
        contentType: 'application/json',
      },
    ];

    const mappings = generateMappings(records);
    expect(mappings).toHaveLength(1);

    const mapping = mappings[0];
    expect(mapping.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(mapping.name).toBe('GET /pets/{petId} - 200');
    expect(mapping.priority).toBe(1);
    expect(mapping.request).toMatchObject({
      method: 'GET',
      urlPathPattern: '/pets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      queryParameters: {
        status: { matches: 'available|pending|sold' },
      },
    });
    expect(mapping.response).toEqual({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      bodyFileName: 'get-pets-petId-200.json',
    });
    expect(mapping.metadata).toEqual({ operationId: 'showPetById' });
  });

  it('applies priority rules for status classes and default responses', () => {
    const records: OperationRecord[] = [
      {
        id: 'ok',
        path: '/ok',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
      {
        id: 'bad',
        path: '/bad',
        method: 'get',
        statusCode: 404,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
      {
        id: 'err',
        path: '/err',
        method: 'get',
        statusCode: 500,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
      {
        id: 'fallback',
        path: '/fallback',
        method: 'get',
        statusCode: 'default',
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
    ];

    const mappings = generateMappings(records);
    expect(mappings.map((m) => m.priority)).toEqual([1, 5, 10, 100]);
    expect(mappings[3].response.status).toBe(500);
    expect(mappings[3].response.bodyFileName).toBe('get-fallback-default.json');
  });

  it('escapes regex characters in enum values', () => {
    const records: OperationRecord[] = [
      {
        id: 'enum-1',
        path: '/search',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [
          { name: 'mode', required: true, enum: ['a+b', 'x.y', 'foo|bar'] },
        ],
        headers: [],
        contentType: 'application/json',
      },
    ];

    const [mapping] = generateMappings(records);
    expect(mapping.request.queryParameters).toEqual({
      mode: { matches: 'a\\+b|x\\.y|foo\\|bar' },
    });
  });

  it('only adds Content-Type request header matcher for POST/PUT/PATCH', () => {
    const records: OperationRecord[] = [
      {
        id: 'get-1',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
      {
        id: 'post-1',
        path: '/pets',
        method: 'post',
        statusCode: 201,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
    ];

    const mappings = generateMappings(records);
    expect(mappings[0].request.headers).toBeUndefined();
    expect(mappings[1].request.headers).toEqual({
      'Content-Type': { equalTo: 'application/json' },
    });
  });

  it('generates identical UUIDs when same seed is provided', () => {
    const records: OperationRecord[] = [
      {
        id: 'get-1',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
      {
        id: 'post-1',
        path: '/pets',
        method: 'post',
        statusCode: 201,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
    ];

    const mappingsA = generateMappings(records, 42);
    const mappingsB = generateMappings(records, 42);

    expect(mappingsA.map((m) => m.id)).toEqual(mappingsB.map((m) => m.id));
  });

  it('generates different UUIDs without seed', () => {
    const records: OperationRecord[] = [
      {
        id: 'get-1',
        path: '/pets',
        method: 'get',
        statusCode: 200,
        pathParams: [],
        queryParams: [],
        headers: [],
        contentType: 'application/json',
      },
    ];

    const mappingsA = generateMappings(records);
    const mappingsB = generateMappings(records);

    expect(mappingsA[0].id).not.toBe(mappingsB[0].id);
  });
});
