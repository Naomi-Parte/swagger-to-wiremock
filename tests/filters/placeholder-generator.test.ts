import { describe, expect, it } from 'vitest';
import {
  synthesisePlaceholderRecords,
  extractSpecificCodes,
  createPlaceholderBody,
} from '../../src/filters/placeholder-generator.js';
import type { OperationRecord } from '../../src/types/operation-record.js';

function makeRecord(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    id: 'op-1',
    path: '/pets',
    method: 'get',
    statusCode: 200,
    pathParams: [{ name: 'petId', required: true }],
    queryParams: [{ name: 'limit', required: false }],
    headers: [],
    contentType: 'application/json',
    operationId: 'listPets',
    summary: 'List pets',
    ...overrides,
  };
}

describe('createPlaceholderBody', () => {
  it('returns an object with status and TODO message', () => {
    const body = createPlaceholderBody('get', '/pets', 400);
    expect(body).toEqual({
      status: 400,
      message: 'TODO: Add your 400 response body for GET /pets',
    });
  });
});

describe('extractSpecificCodes', () => {
  it('extracts specific numeric codes', () => {
    expect(extractSpecificCodes(['400', '401'])).toEqual([400, 401]);
  });

  it('returns empty array for a class filter', () => {
    expect(extractSpecificCodes(['4xx'])).toEqual([]);
  });

  it('returns empty array for mixed class and specific filters', () => {
    expect(extractSpecificCodes(['4xx', '400'])).toEqual([]);
  });
});

describe('synthesisePlaceholderRecords', () => {
  it('creates one record per unique operation per status code', () => {
    const records = [
      makeRecord({ id: 'a', method: 'get', path: '/pets', statusCode: 200 }),
      makeRecord({ id: 'b', method: 'post', path: '/pets', statusCode: 201 }),
    ];

    const result = synthesisePlaceholderRecords(records, [400]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => `${r.method}:${r.path}:${r.statusCode}`)).toEqual([
      'get:/pets:400',
      'post:/pets:400',
    ]);
  });

  it('copies path, method, pathParams, queryParams from template records', () => {
    const records = [
      makeRecord({
        id: 'a',
        method: 'get',
        path: '/pets/{petId}',
        pathParams: [{ name: 'petId', type: 'string', required: true }],
        queryParams: [{ name: 'limit', type: 'integer', required: false }],
      }),
    ];

    const [placeholder] = synthesisePlaceholderRecords(records, [404]);
    expect(placeholder.path).toBe('/pets/{petId}');
    expect(placeholder.method).toBe('get');
    expect(placeholder.pathParams).toEqual([{ name: 'petId', type: 'string', required: true }]);
    expect(placeholder.queryParams).toEqual([{ name: 'limit', type: 'integer', required: false }]);
    expect(placeholder.statusCode).toBe(404);
    expect(placeholder.responseSchema).toBeUndefined();
    expect(placeholder.responseExample).toBeUndefined();
  });

  it('multiplies records when given multiple status codes', () => {
    const records = [makeRecord({ id: 'a', method: 'get', path: '/pets' })];

    const result = synthesisePlaceholderRecords(records, [400, 401, 403]);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.statusCode)).toEqual([400, 401, 403]);
  });

  it('deduplicates records with the same path + method before multiplying', () => {
    const records = [
      makeRecord({ id: 'a', method: 'get', path: '/pets', statusCode: 200 }),
      makeRecord({ id: 'b', method: 'get', path: '/pets', statusCode: 404 }),
    ];

    const result = synthesisePlaceholderRecords(records, [500]);
    expect(result).toHaveLength(1);
    expect(result[0].statusCode).toBe(500);
  });
});
