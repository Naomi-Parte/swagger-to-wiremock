/**
 * @file Status class classifier
 * @description Groups operation records by HTTP status code class (2xx, 4xx, 5xx, etc.)
 */

import type { OperationRecord } from '../types/operation-record.js';

/**
 * Classify a status code into its class folder name.
 * @param statusCode - e.g. 200, 404, "default"
 * @returns e.g. "2xx", "4xx", "5xx"
 */
export function getStatusClass(statusCode: number | string): string {
  if (statusCode === 'default') return '5xx';
  const code = Number(statusCode);
  const classDigit = Math.floor(code / 100);
  return `${classDigit}xx`;
}

/**
 * Group records by status class.
 * @param records - All operation records
 * @returns Map of class → records (e.g. { "2xx": [...], "5xx": [...] })
 */
export function groupByStatusClass(records: OperationRecord[]): Map<string, OperationRecord[]> {
  const groups = new Map<string, OperationRecord[]>();
  for (const record of records) {
    const cls = getStatusClass(record.statusCode);
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(record);
  }
  return groups;
}
