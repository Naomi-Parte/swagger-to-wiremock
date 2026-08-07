/**
 * @file Response example resolver
 * @description Extracts a verbatim example response body from an OperationRecord, if present
 */

import type { OperationRecord } from '../types/operation-record.js';

/**
 * Resolve a verbatim example response body from an operation record.
 *
 * Priority order:
 * 1. mediaType.example field (record.responseExample) → use verbatim
 * 2. schema.example field → use verbatim
 *
 * @param record - Operation record with response metadata
 * @returns The example value if one is present, otherwise undefined
 */
export function resolveExampleBody(record: OperationRecord): unknown | undefined {
  // Priority 1: mediaType.example field
  if (record.responseExample !== undefined) {
    return record.responseExample;
  }

  // Priority 2: schema.example field
  if (
    record.responseSchema !== null &&
    record.responseSchema !== undefined &&
    typeof record.responseSchema === 'object'
  ) {
    const schema = record.responseSchema as Record<string, unknown>;
    if (schema.example !== undefined) {
      return schema.example;
    }
  }

  return undefined;
}
