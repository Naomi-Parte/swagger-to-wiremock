/**
 * @file Status code filter
 * @description Filters OperationRecord[] by status code class or specific codes
 */

import type { OperationRecord } from '../types/operation-record.js';

export type StatusFilter = string; // e.g. "2xx", "4xx", "5xx", "400", "404", "500"

/**
 * Parse a comma-separated status filter string into individual filters.
 * @param filterStr - e.g. "2xx,4xx,500"
 * @returns Array of filter tokens
 */
export function parseStatusFilter(filterStr: string): StatusFilter[] {
  return filterStr
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Check if a status code matches a filter token.
 * @param statusCode - Record's status code (number or "default")
 * @param filter - Filter token (e.g. "2xx", "400", "default")
 * @returns true if matches
 */
export function statusMatchesFilter(statusCode: number | string, filter: StatusFilter): boolean {
  // Handle "default" status
  if (statusCode === 'default') {
    // "default" matches "5xx" (since default normalizes to 500) and "default"
    return filter === 'default' || filter === '5xx';
  }

  const numericCode = Number(statusCode);

  // Class match: "2xx", "4xx", "5xx"
  if (filter.endsWith('xx')) {
    const classDigit = parseInt(filter[0]!, 10);
    return Math.floor(numericCode / 100) === classDigit;
  }

  // Exact match: "400", "404", "500"
  return numericCode === parseInt(filter, 10);
}

/**
 * Filter operation records by status code.
 * @param records - All operation records
 * @param filters - Status filter tokens. If empty, returns all records.
 * @returns Filtered records
 */
export function filterByStatus(records: OperationRecord[], filters: StatusFilter[]): OperationRecord[] {
  if (filters.length === 0) {
    return records;
  }

  return records.filter((record) =>
    filters.some((filter) => statusMatchesFilter(record.statusCode, filter)),
  );
}
