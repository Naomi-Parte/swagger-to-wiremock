/**
 * @file Response body generator
 * @description Generates response bodies from IR records using priority-based resolution
 */

import type { OperationRecord } from '../types/operation-record.js';
import { resolveExampleBody } from './example-resolver.js';
import { generateFromSchema } from './schema-faker-generator.js';

/**
 * Generate response body for a given operation record
 *
 * Priority order for body resolution:
 * 1. mediaType.example field → use verbatim
 * 2. mediaType.examples field → use first entry's .value
 * 3. schema.example field → use verbatim
 * 4. json-schema-faker generation from schema (seeded)
 * 5. Empty object {} → fallback when nothing else available
 *
 * @param record - Operation record with response metadata
 * @param seed - Random seed for json-schema-faker (default 42)
 * @returns Generated or extracted response body object, or null if unable to generate
 */
export function generateResponseBody(record: OperationRecord, seed: number = 42): unknown | null {
  // Priorities 1-2 (mediaType.example) and 3 (schema.example): verbatim examples
  const exampleBody = resolveExampleBody(record);
  if (exampleBody !== undefined) {
    return exampleBody;
  }

  // Priority 4: Generate from schema using json-schema-faker
  if (
    record.responseSchema !== null &&
    record.responseSchema !== undefined &&
    typeof record.responseSchema === 'object'
  ) {
    try {
      return generateFromSchema(record.responseSchema, seed);
    } catch {
      // If generation fails, fall through to empty object
    }
  }

  // Priority 5: Empty object fallback
  return {};
}
