import { describe, expect, it } from 'vitest';
import { getStatusClass, groupByStatusClass } from '../../src/filters/status-classifier.js';
import type { OperationRecord } from '../../src/types/operation-record.js';

function makeRecord(statusCode: number | string): OperationRecord {
  return {
    id: `op-${String(statusCode)}`,
    operationId: `op-${String(statusCode)}`,
    path: '/pets',
    method: 'get',
    statusCode,
    pathParams: [],
    queryParams: [],
    headers: [],
    contentType: 'application/json',
  };
}

describe('getStatusClass', () => {
  it('classifies 200 as 2xx', () => {
    expect(getStatusClass(200)).toBe('2xx');
  });

  it('classifies 404 as 4xx', () => {
    expect(getStatusClass(404)).toBe('4xx');
  });

  it('classifies 500 as 5xx', () => {
    expect(getStatusClass(500)).toBe('5xx');
  });

  it('classifies "default" as 5xx', () => {
    expect(getStatusClass('default')).toBe('5xx');
  });
});

describe('groupByStatusClass', () => {
  it('groups records by their status class', () => {
    const records = [makeRecord(200), makeRecord(201), makeRecord(404), makeRecord('default')];

    const groups = groupByStatusClass(records);

    expect(groups.get('2xx')).toEqual([records[0], records[1]]);
    expect(groups.get('4xx')).toEqual([records[2]]);
    expect(groups.get('5xx')).toEqual([records[3]]);
  });

  it('returns an empty map for an empty input', () => {
    const groups = groupByStatusClass([]);
    expect(groups.size).toBe(0);
  });
});
