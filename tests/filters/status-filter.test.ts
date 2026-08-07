import { describe, expect, it } from 'vitest';
import {
  parseStatusFilter,
  statusMatchesFilter,
  filterByStatus,
} from '../../src/filters/status-filter.js';
import type { OperationRecord } from '../../src/types/operation-record.js';

function makeRecord(id: string, statusCode: number | string): OperationRecord {
  return {
    id,
    path: '/pets',
    method: 'get',
    statusCode,
    pathParams: [],
    queryParams: [],
    headers: [],
    contentType: 'application/json',
  };
}

describe('parseStatusFilter', () => {
  it('parses comma-separated string', () => {
    expect(parseStatusFilter('2xx,4xx,500')).toEqual(['2xx', '4xx', '500']);
  });

  it('handles whitespace', () => {
    expect(parseStatusFilter(' 2xx , 4xx ')).toEqual(['2xx', '4xx']);
  });
});

describe('statusMatchesFilter', () => {
  it('200 matches "2xx"', () => {
    expect(statusMatchesFilter(200, '2xx')).toBe(true);
  });

  it('404 matches "4xx"', () => {
    expect(statusMatchesFilter(404, '4xx')).toBe(true);
  });

  it('404 does not match "2xx"', () => {
    expect(statusMatchesFilter(404, '2xx')).toBe(false);
  });

  it('404 matches "404" exactly', () => {
    expect(statusMatchesFilter(404, '404')).toBe(true);
  });

  it('"default" matches "5xx"', () => {
    expect(statusMatchesFilter('default', '5xx')).toBe(true);
  });

  it('"default" matches "default"', () => {
    expect(statusMatchesFilter('default', 'default')).toBe(true);
  });
});

describe('filterByStatus', () => {
  it('returns all records when filters is empty', () => {
    const records = [makeRecord('a', 200), makeRecord('b', 404)];
    expect(filterByStatus(records, [])).toEqual(records);
  });

  it('keeps only 4xx records', () => {
    const records = [makeRecord('a', 200), makeRecord('b', 404), makeRecord('c', 500)];
    const result = filterByStatus(records, ['4xx']);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('keeps 2xx and 404 records', () => {
    const records = [
      makeRecord('a', 200),
      makeRecord('b', 404),
      makeRecord('c', 500),
      makeRecord('d', 201),
    ];
    const result = filterByStatus(records, ['2xx', '404']);
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'd']);
  });

  it('returns empty array when no matches', () => {
    const records = [makeRecord('a', 200), makeRecord('b', 201)];
    const result = filterByStatus(records, ['5xx']);
    expect(result).toEqual([]);
  });
});
