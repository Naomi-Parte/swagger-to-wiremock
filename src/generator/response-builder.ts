/**
 * @file Response body generator
 * @description Generates response bodies from IR records using priority-based resolution
 */

import type { OperationRecord } from '../types/operation-record.js';
import jsf from 'json-schema-faker';
import { Faker, en } from '@faker-js/faker';

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
  // Priority 1: mediaType.example field
  if (record.responseExample !== undefined) {
    return record.responseExample;
  }

  // Priority 2: mediaType.examples (structured examples object)
  // Note: this would be populated by transformer if present
  // For now, handled by responseExample above

  // Priority 3: schema.example field
  if (record.responseSchema !== null && record.responseSchema !== undefined && typeof record.responseSchema === 'object') {
    const schema = record.responseSchema as Record<string, unknown>;
    if (schema.example !== undefined) {
      return schema.example;
    }
  }

  // Priority 4: Generate from schema using json-schema-faker
  if (record.responseSchema !== null && record.responseSchema !== undefined && typeof record.responseSchema === 'object') {
    try {
      return generateFromSchema(record.responseSchema, seed);
    } catch {
      // If generation fails, fall through to empty object
    }
  }

  // Priority 5: Empty object fallback
  return {};
}

/**
 * Generate a value from a JSON Schema using json-schema-faker
 * Seeded for deterministic output
 * @param schema - JSON Schema object
 * @param seed - Random seed for deterministic generation
 * @returns Generated value matching the schema
 */
function generateFromSchema(schema: unknown, seed: number): unknown {
  // Create a seeded faker instance
  const seededFaker = new Faker({ locale: en, seed });

  // Configure json-schema-faker to use the seeded faker
  jsf.extend('faker', () => seededFaker);

  // Set options for generation
  jsf.option({
    optionalsProbability: 0.8, // Generate 80% of optional fields
    alwaysFakeOptionals: false,
    failOnInvalidTypes: false,
    failOnInvalidFormat: false,
  });

  // Generate and return (pass empty refs object)
  return jsf.generate(schema as Record<string, unknown>, {});
}
