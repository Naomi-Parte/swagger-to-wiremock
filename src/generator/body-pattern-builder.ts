/**
 * @file Body pattern builder for WireMock request matching
 * @description Generates `bodyPatterns` entries from request body schemas.
 *   Uses `matchesJsonPath` to assert that required fields exist in the request body.
 *   This provides structural validation without requiring exact value matches.
 */

import type { OperationRecord } from '../types/operation-record.js';

/**
 * A single WireMock body pattern entry
 */
export interface BodyPattern {
  matchesJsonPath?: string;
}

/**
 * Build WireMock bodyPatterns from an operation record's request body schema.
 *
 * Strategy: Generate `matchesJsonPath` assertions for each required field.
 * This ensures the request body contains the expected structure without
 * over-constraining the values (testers can still send any valid value).
 *
 * Only generates patterns for:
 * - Methods that carry request bodies (POST, PUT, PATCH)
 * - Operations that have a request body schema defined
 * - Required fields at the top level of the schema
 *
 * @param record - Operation record with request body metadata
 * @returns Array of body patterns, or undefined if no patterns should be applied
 */
export function buildBodyPatterns(record: OperationRecord): BodyPattern[] | undefined {
  // Only generate for methods that have request bodies
  if (!methodHasRequestBody(record.method)) return undefined;

  // Must have a request body schema
  if (!record.requestBodySchema) return undefined;

  // Must have required fields to match on
  const requiredFields = record.requestBodyRequiredFields;
  if (!requiredFields || requiredFields.length === 0) return undefined;

  const patterns: BodyPattern[] = [];

  for (const field of requiredFields) {
    // Generate a JsonPath expression that asserts the field exists
    // $.fieldName — matches if the field is present (any value including null)
    patterns.push({
      matchesJsonPath: buildJsonPath('$', field),
    });
  }

  // Also check nested required fields one level deep (properties with their own required array)
  const nestedPatterns = buildNestedRequiredPatterns(record.requestBodySchema);
  patterns.push(...nestedPatterns);

  return patterns.length > 0 ? patterns : undefined;
}

/**
 * Build JsonPath patterns for nested required fields (one level deep).
 *
 * For each property that is itself an object with required fields,
 * generate patterns like `$.address.street`, `$.address.city`.
 *
 * Only goes one level deep to keep patterns readable and maintainable.
 */
function buildNestedRequiredPatterns(schema: Record<string, unknown>): BodyPattern[] {
  const patterns: BodyPattern[] = [];
  const properties = schema.properties as Record<string, unknown> | undefined;

  if (!properties) return patterns;

  // Only look at required top-level properties that are objects with their own required fields
  const topRequired = (schema.required as string[] | undefined) ?? [];

  for (const fieldName of topRequired) {
    const fieldSchema = properties[fieldName] as Record<string, unknown> | undefined;
    if (!fieldSchema) continue;
    if (fieldSchema.type !== 'object') continue;

    const nestedRequired = fieldSchema.required as string[] | undefined;
    if (!nestedRequired || nestedRequired.length === 0) continue;

    for (const nestedField of nestedRequired) {
      patterns.push({
        matchesJsonPath: buildJsonPath(buildJsonPath('$', fieldName), nestedField),
      });
    }
  }

  return patterns;
}

/**
 * Build a JsonPath expression by appending a field to a base path.
 * Uses dot notation for simple identifiers, bracket notation for complex ones.
 */
function buildJsonPath(basePath: string, field: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
    return `${basePath}.${field}`;
  }
  // Bracket notation — no dot between base and bracket
  return `${basePath}['${field.replace(/'/g, "\\'")}']`;
}

/**
 * Escape special characters in a field name for JsonPath.
 * If the field contains dots, brackets, or spaces, use bracket notation.
 */
function escapeJsonPathField(field: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
    return field; // simple identifier, no escaping needed
  }
  // Use bracket notation for complex field names
  return `['${field.replace(/'/g, "\\'")}']`;
}

/**
 * Check if an HTTP method can carry a request body.
 */
function methodHasRequestBody(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH';
}
