/**
 * @file Placeholder record synthesiser
 * @description Creates synthetic OperationRecord entries for undefined status codes
 */

import type { OperationRecord } from '../types/operation-record.js';

/**
 * Placeholder body template for __files/
 * @param method - HTTP method (e.g. "get")
 * @param path - OpenAPI path (e.g. "/pets")
 * @param statusCode - Status code the placeholder is for
 * @returns Placeholder body object with a TODO message
 */
export function createPlaceholderBody(method: string, path: string, statusCode: number): unknown {
  return {
    status: statusCode,
    message: `TODO: Add your ${statusCode} response body for ${method.toUpperCase()} ${path}`,
  };
}

/**
 * Synthesise placeholder operation records for each unique operation (path + method)
 * with the given status code(s).
 * @param existingRecords - All records from the transformer (to extract unique operations)
 * @param statusCodes - Specific status codes to synthesise (e.g. [400, 401])
 * @returns Synthetic OperationRecord[] with placeholder data
 */
export function synthesisePlaceholderRecords(
  existingRecords: OperationRecord[],
  statusCodes: number[],
): OperationRecord[] {
  // Get unique operations (path + method combos)
  const uniqueOps = new Map<string, OperationRecord>();
  for (const record of existingRecords) {
    const key = `${record.method}:${record.path}`;
    if (!uniqueOps.has(key)) {
      uniqueOps.set(key, record);
    }
  }

  const placeholders: OperationRecord[] = [];

  for (const [, templateRecord] of uniqueOps) {
    for (const statusCode of statusCodes) {
      placeholders.push({
        id: `placeholder-${templateRecord.method}-${templateRecord.path}-${statusCode}`,
        path: templateRecord.path,
        method: templateRecord.method,
        statusCode,
        operationId: templateRecord.operationId,
        summary: templateRecord.summary,
        pathParams: templateRecord.pathParams,
        queryParams: templateRecord.queryParams,
        headers: templateRecord.headers,
        contentType: templateRecord.contentType || 'application/json',
        // No responseSchema or responseExample — placeholder will be used
        responseSchema: undefined,
        responseExample: undefined,
      });
    }
  }

  return placeholders;
}

/**
 * Determine if a filter string contains only specific numeric codes (not classes like "2xx").
 * @param filters - Parsed filter tokens
 * @returns List of specific numeric codes, or empty if any class filters present
 */
export function extractSpecificCodes(filters: string[]): number[] {
  const codes: number[] = [];
  for (const filter of filters) {
    if (filter.endsWith('xx') || filter === 'default') {
      return []; // Contains a class filter — can't synthesise
    }
    const num = parseInt(filter, 10);
    if (!isNaN(num)) {
      codes.push(num);
    }
  }
  return codes;
}
