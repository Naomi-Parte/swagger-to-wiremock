/**
 * @file URL path pattern generator
 * @description Converts OpenAPI paths with parameters to WireMock URL patterns
 */

import type { OperationRecord } from '../types/operation-record.js';
import { getPathParamPattern } from './path-param-patterns.js';

/**
 * Result of URL pattern generation
 */
export interface URLPatternResult {
  /** WireMock URL matching strategy: either urlPathEqualTo or urlPathPattern */
  strategy: 'urlPathEqualTo' | 'urlPathPattern';
  /** The actual URL value (exact path or regex pattern) */
  url: string;
}

/**
 * Generate URL pattern from OpenAPI path and parameters
 * @param record - Operation record with path and path parameters
 * @returns URL pattern configuration (exact match or regex pattern)
 *
 * Rule: No parameters → urlPathEqualTo (exact match)
 *       With parameters → urlPathPattern (regex match with format-aware patterns)
 *
 * Examples:
 *   /pets → { strategy: "urlPathEqualTo", url: "/pets" }
 *   /pets/{petId} → { strategy: "urlPathPattern", url: "/pets/[^/]+" }
 *   /users/{userId} (uuid) → { strategy: "urlPathPattern", url: "/users/[0-9a-f]{8}-..." }
 */
export function generateURLPattern(record: OperationRecord): URLPatternResult {
  // No path parameters → exact match
  if (record.pathParams.length === 0 && !record.serverBasePath) {
    return {
      strategy: 'urlPathEqualTo',
      url: record.path,
    };
  }

  // Prepend server base path if present
  const basePath = record.serverBasePath || '';
  const fullPath = basePath + record.path;

  // No path parameters but has server base path
  if (record.pathParams.length === 0) {
    // If base path contains regex patterns (from --include-server-variables), use urlPathPattern
    if (basePath.includes('[^/]+')) {
      return {
        strategy: 'urlPathPattern',
        url: fullPath,
      };
    }
    return {
      strategy: 'urlPathEqualTo',
      url: fullPath,
    };
  }

  // Build regex pattern by replacing {paramName} with format-specific regex
  let pattern = fullPath;

  for (const param of record.pathParams) {
    const regex = getPathParamPattern(param.type, param.format);
    // Replace {paramName} with the regex pattern
    pattern = pattern.replace(`{${param.name}}`, regex);
  }

  return {
    strategy: 'urlPathPattern',
    url: pattern,
  };
}
