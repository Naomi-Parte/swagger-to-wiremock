/**
 * @file OpenAPI 3.1 schema normalizer
 * @description Normalizes OpenAPI 3.1 JSON Schema features into a form compatible
 *   with json-schema-faker and our existing pipeline. This module handles:
 *   - type arrays: `type: ["string", "null"]` → `type: "string"` (pick first non-null)
 *   - nullable removal: 3.1 removed `nullable`, uses type arrays instead
 *   - prefixItems: 3.1 keyword for tuple validation (map to `items` for faker)
 *   - const: treat as enum with single value for faker compatibility
 *
 * The transformer applies this normalization before storing schemas in OperationRecords,
 * so downstream modules (generator, faker) always see a clean 3.0-style schema.
 */

/**
 * Recursively normalize an OpenAPI 3.1 schema to be compatible with json-schema-faker.
 * Mutates nothing — returns a new schema object.
 *
 * @param schema - Raw JSON Schema (potentially 3.1 style)
 * @returns Normalized schema compatible with json-schema-faker
 */
export function normalizeSchema(schema: unknown): unknown {
  if (schema === null || schema === undefined) return schema;
  if (typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(normalizeSchema);

  const obj = { ...(schema as Record<string, unknown>) };

  // 1. Handle type arrays: type: ["string", "null"] → type: "string"
  if (Array.isArray(obj.type)) {
    const types = obj.type as string[];
    const nonNullTypes = types.filter((t) => t !== 'null');

    if (nonNullTypes.length === 1) {
      obj.type = nonNullTypes[0];
    } else if (nonNullTypes.length > 1) {
      // Multiple non-null types — pick the first one for faker
      // (json-schema-faker doesn't handle type unions well)
      obj.type = nonNullTypes[0];
    } else {
      // Only "null" — unusual but handle gracefully
      obj.type = 'string';
    }

    // If "null" was in the array, this is effectively nullable
    if (types.includes('null')) {
      // Don't set nullable — just let faker generate a value of the primary type
      // This avoids json-schema-faker confusion with nullable
    }
  }

  // 2. Remove `nullable` keyword (3.1 doesn't use it, but some mixed specs might have it)
  // json-schema-faker handles nullable fine, but for consistency we strip it
  // Actually — keep nullable for 3.0 compat; only remove if we see type arrays
  // The presence of nullable with a type array would be contradictory; type array wins.
  if (Array.isArray((schema as Record<string, unknown>).type) && 'nullable' in obj) {
    delete obj.nullable;
  }

  // 3. Handle `const` — treat as enum with single value for faker compatibility
  if ('const' in obj && obj.const !== undefined) {
    obj.enum = [obj.const];
    delete obj.const;
  }

  // 4. Handle `prefixItems` (3.1 tuple validation) — map to `items` for faker
  if ('prefixItems' in obj && Array.isArray(obj.prefixItems)) {
    // json-schema-faker doesn't understand prefixItems
    // Convert to items as a schema that matches any of the prefix items
    const prefixItems = obj.prefixItems as unknown[];
    if (prefixItems.length === 1) {
      obj.items = normalizeSchema(prefixItems[0]);
    } else if (prefixItems.length > 1) {
      // Use oneOf for multiple tuple types
      obj.items = { oneOf: prefixItems.map(normalizeSchema) };
    }
    delete obj.prefixItems;

    // If there's also an `items` from the spec (used as additionalItems in 3.1), keep our override
  }

  // 5. Handle `$defs` (3.1 renamed from `definitions`)
  if ('$defs' in obj && typeof obj.$defs === 'object' && obj.$defs !== null) {
    const defs = obj.$defs as Record<string, unknown>;
    obj.definitions = Object.fromEntries(
      Object.entries(defs).map(([key, value]) => [key, normalizeSchema(value)]),
    );
    delete obj.$defs;
  }

  // 6. Recursively normalize nested schemas
  if (obj.properties && typeof obj.properties === 'object') {
    const props = obj.properties as Record<string, unknown>;
    obj.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [key, normalizeSchema(value)]),
    );
  }

  if (obj.items && typeof obj.items === 'object' && !Array.isArray(obj.items)) {
    obj.items = normalizeSchema(obj.items);
  }

  if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
    obj.additionalProperties = normalizeSchema(obj.additionalProperties);
  }

  // allOf, oneOf, anyOf
  for (const keyword of ['allOf', 'oneOf', 'anyOf'] as const) {
    if (Array.isArray(obj[keyword])) {
      obj[keyword] = (obj[keyword] as unknown[]).map(normalizeSchema);
    }
  }

  // not
  if (obj.not && typeof obj.not === 'object') {
    obj.not = normalizeSchema(obj.not);
  }

  return obj;
}
