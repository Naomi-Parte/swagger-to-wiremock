/**
 * @file Extract response data from OpenAPI operation
 * @description Extracts response examples and schemas from response definitions
 */

import { normalizeSchema } from './normalize-schema.js';

/**
 * Response extraction result
 */
export interface ExtractedResponse {
  statusCode: number | string;
  contentType: string;
  example?: unknown;
  schema?: unknown;
}

/**
 * Get the most appropriate response content type
 * @param content - Content object from response
 * @returns Content type (defaults to application/json)
 */
function getPrimaryContentType(content: Record<string, unknown> | undefined): string {
  if (!content) return 'application/json';

  // Prefer JSON
  if ('application/json' in content) return 'application/json';

  // Fall back to first available
  const [contentType] = Object.keys(content);
  return contentType || 'application/json';
}

/**
 * Extract example or schema from media type object
 * @param mediaType - Media type object from response content
 * @returns Object with example and schema, if present
 */
function extractMediaTypeContent(mediaType: Record<string, unknown>): {
  example?: unknown;
  schema?: unknown;
} {
  const result: { example?: unknown; schema?: unknown } = {};

  // Priority: media type example > examples first value > schema example > schema
  if (mediaType.example !== undefined) {
    result.example = mediaType.example;
  } else if (mediaType.examples !== undefined) {
    const examples = mediaType.examples as Record<string, unknown>;
    const firstExample = Object.values(examples)[0] as Record<string, unknown> | undefined;
    if (firstExample?.value !== undefined) {
      result.example = firstExample.value;
    }
  }

  if (mediaType.schema !== undefined) {
    result.schema = mediaType.schema;
    // If schema has an example and we don't have one yet
    if (result.example === undefined && (mediaType.schema as Record<string, unknown>).example) {
      result.example = (mediaType.schema as Record<string, unknown>).example;
    }
  }

  return result;
}

/**
 * Extract all responses from an operation
 * @param operation - OpenAPI operation object
 * @returns Array of extracted responses (one per status code)
 *
 * Note: "default" responses are preserved as the literal string "default" in statusCode
 *       The mapping to an actual HTTP status occurs in the generator step
 */
export function extractOperationResponses(
  operation: Record<string, unknown>,
): ExtractedResponse[] {
  const responses: ExtractedResponse[] = [];
  const responsesObj = operation.responses as Record<string, unknown> | undefined;

  if (!responsesObj) return responses;

  Object.entries(responsesObj).forEach(([statusCode, response]) => {
    // Keep "default" as a literal string; skip other non-numeric status codes (4XX, 5XX patterns, etc.)
    let finalStatusCode: number | string;

    if (statusCode === 'default') {
      finalStatusCode = 'default';
    } else if (!/^\d{3}$/.test(statusCode)) {
      return; // Skip pattern-based status codes
    } else {
      finalStatusCode = parseInt(statusCode, 10);
    }

    const responseObj = response as Record<string, unknown>;
    const content = responseObj.content as Record<string, unknown> | undefined;
    const contentType = getPrimaryContentType(content);

    const mediaType = content?.[contentType] as Record<string, unknown> | undefined;
    const { example, schema } = mediaType ? extractMediaTypeContent(mediaType) : {};

    responses.push({
      statusCode: finalStatusCode,
      contentType,
      example,
      schema: schema !== undefined ? normalizeSchema(schema) : undefined,
    });
  });

  return responses;
}
