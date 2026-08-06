/**
 * @file Schema-based fake data generator
 * @description Wraps json-schema-faker + seeded Faker to deterministically generate values from JSON Schema
 */

import jsf from 'json-schema-faker';
import { Faker, en } from '@faker-js/faker';
import { createSeededRandom } from './seeded-random.js';

// Configure static json-schema-faker options once at module load.
// Calling jsf.option() repeatedly can reset/mutate shared internal state,
// so this must run exactly once, not per-call. Per-call, per-seed values
// (the `random` number generator and the `faker` extension) are set inside
// generateFromSchema() below, since they must vary with the requested seed.
jsf.option({
  optionalsProbability: 0.8, // Generate 80% of optional fields
  alwaysFakeOptionals: false,
  failOnInvalidTypes: false,
  failOnInvalidFormat: false,
});

/**
 * Generate a value from a JSON Schema using json-schema-faker.
 * Deterministic: the same schema + seed always produces the same output,
 * regardless of how many times this function has been called before in the process.
 * @param schema - JSON Schema object
 * @param seed - Random seed for deterministic generation
 * @returns Generated value matching the schema
 */
export function generateFromSchema(schema: unknown, seed: number): unknown {
  // Create a fresh seeded faker instance for this call and bind it to jsf.
  // Rebinding before every generation call ensures the seed always matches
  // the record being generated, independent of prior calls.
  const seededFaker = new Faker({ locale: en, seed });
  jsf.extend('faker', () => seededFaker);

  // json-schema-faker's own internal random decisions (which optional
  // properties/array items to include) use the `random` option, which
  // defaults to Math.random and is NOT tied to the faker extension above.
  // Rebinding it to a seeded PRNG per call is required for byte-for-byte
  // deterministic output given the same schema + seed.
  jsf.option({ random: createSeededRandom(seed) });

  return jsf.generate(schema as Record<string, unknown>, {});
}
