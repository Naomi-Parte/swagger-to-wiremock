/**
 * @file Extract request body schema from OpenAPI operation
 * @description Extracts the request body JSON schema and identifies required fields
 *   for downstream body pattern matching in WireMock.
 */

import { normalizeSchema } from './normalize-schema.js';

/**
 * Extracted request body information
 */
export interface ExtractedRequestBody {
  /** The full JSON schema for the request body (normalized for 3.1 compat) */
  schema: Record<string, unknown>;

  /** Content type expected (e.g. "application/json") */
  contentType: string;

  /** Whether the request body is marked as required in the spec */
  required: boolean;

  /** Top-level required field names (from schema.required array) */
  requiredFields: string[];
}

/**
 * Extract request body schema from an OpenAPI operation.
 *
 * Only extracts JSON request bodies — other content types (form-data, xml, etc.)
 * are skipped since WireMock bodyPatterns work best with JSON matching.
 *
 * @param operation - OpenAPI operation object
 * @returns Extracted request body info, or undefined if no JSON request body
 */
export function extractRequestBody(
  operation: Record<string, unknown>,
): ExtractedRequestBody | undefined {
  const requestBody = operation.requestBody as Record<string, unknown> | undefined;
  if (!requestBody) return undefined;

  const content = requestBody.content as Record<string, unknown> | undefined;
  if (!content) return undefined;

  // Prefer application/json; fall back to any JSON-like content type
  const jsonContentType = findJsonContentType(content);
  if (!jsonContentType) return undefined;

  const mediaType = content[jsonContentType] as Record<string, unknown> | undefined;
  if (!mediaType) return undefined;

  const schema = mediaType.schema as Record<string, unknown> | undefined;
  if (!schema) return undefined;

  // Normalize for 3.1 compatibility (type arrays, const, etc.)
  const normalizedSchema = normalizeSchema(schema) as Record<string, unknown>;

  // Extract required fields from the schema's `required` array
  const requiredFields = Array.isArray(normalizedSchema.required)
    ? (normalizedSchema.required as string[])
    : [];

  return {
    schema: normalizedSchema,
    contentType: jsonContentType,
    required: requestBody.required === true,
    requiredFields,
  };
}

/**
 * Find a JSON-compatible content type key in the content map.
 * Prefers exact "application/json", falls back to JSON-like types.
 */
function findJsonContentType(content: Record<string, unknown>): string | undefined {
  if ('application/json' in content) return 'application/json';

  // Check for JSON-like content types (e.g. application/vnd.api+json)
  const jsonLike = Object.keys(content).find(
    (ct) => ct.includes('json') || ct.includes('+json'),
  );

  return jsonLike;
}
