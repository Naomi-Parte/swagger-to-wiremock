/**
 * @file Integration tests for OpenAPI 3.1 support
 * @description End-to-end tests verifying that 3.1 specs are parsed, transformed,
 *   and generate correct WireMock mappings
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseOpenAPISpec } from '../../src/parser/index.js';
import { transformSpec } from '../../src/transformer/index.js';
import { generateMappings } from '../../src/generator/index.js';
import { validateOpenAPIVersion } from '../../src/parser/validate-version.js';
import { ParserError } from '../../src/errors/parser-error.js';

const SPEC_31_PATH = resolve(__dirname, '../fixtures/specs/petstore-3.1.yaml');

describe('OpenAPI 3.1 support', () => {
  describe('version validation', () => {
    it('accepts OpenAPI 3.1.0', () => {
      expect(validateOpenAPIVersion({ openapi: '3.1.0' })).toBe('3.1.0');
    });

    it('accepts OpenAPI 3.1.1', () => {
      expect(validateOpenAPIVersion({ openapi: '3.1.1' })).toBe('3.1.1');
    });

    it('still accepts OpenAPI 3.0.x', () => {
      expect(validateOpenAPIVersion({ openapi: '3.0.3' })).toBe('3.0.3');
    });

    it('still rejects Swagger 2.0', () => {
      expect(() => validateOpenAPIVersion({ swagger: '2.0' })).toThrow(ParserError);
    });

    it('rejects OpenAPI 4.0', () => {
      expect(() => validateOpenAPIVersion({ openapi: '4.0.0' })).toThrow(ParserError);
    });
  });

  describe('full pipeline', () => {
    it('parses a 3.1 spec without errors', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      expect(spec).toBeDefined();
      expect(spec.openapi).toBe('3.1.0');
    });

    it('transforms a 3.1 spec into operation records', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);
      expect(records.length).toBeGreaterThan(0);
    });

    it('preserves all paths from the 3.1 spec', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);
      const paths = [...new Set(records.map((r) => r.path))];
      expect(paths).toContain('/pets');
      expect(paths).toContain('/pets/{petId}');
    });

    it('generates mappings from a 3.1 spec', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);
      const mappings = generateMappings(records, 42);
      expect(mappings.length).toBe(records.length);
    });

    it('generates deterministic output from 3.1 spec', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);
      const mappingsA = generateMappings(records, 42);
      const mappingsB = generateMappings(records, 42);
      expect(JSON.stringify(mappingsA)).toBe(JSON.stringify(mappingsB));
    });
  });

  describe('3.1 schema features in output', () => {
    it('handles type arrays (type: ["string", "null"]) without errors', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);
      const mappings = generateMappings(records, 42);

      // Should generate valid mappings — no crashes from type arrays
      expect(mappings.length).toBeGreaterThan(0);
      for (const mapping of mappings) {
        expect(mapping.response).toBeDefined();
      }
    });

    it('handles const keyword without errors', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);

      // Pet schema has `status: { const: "active" }` — should normalize to enum
      const petRecords = records.filter(
        (r) => r.path === '/pets/{petId}' && r.statusCode === 200,
      );
      expect(petRecords.length).toBeGreaterThan(0);

      // Generate should not crash
      const mappings = generateMappings(petRecords, 42);
      expect(mappings.length).toBeGreaterThan(0);
    });

    it('handles prefixItems without errors', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);

      // Pet schema has `nicknames` with prefixItems — should normalize
      const mappings = generateMappings(records, 42);
      expect(mappings.length).toBeGreaterThan(0);
    });

    it('normalizes schemas so responseSchema has no type arrays', async () => {
      const spec = await parseOpenAPISpec(SPEC_31_PATH);
      const records = transformSpec(spec);

      // Check that schemas in records are normalized (no type arrays remain)
      for (const record of records) {
        if (record.responseSchema && typeof record.responseSchema === 'object') {
          checkNoTypeArrays(record.responseSchema as Record<string, unknown>);
        }
      }
    });
  });
});

/**
 * Recursively check that no schema in the tree has a type array
 */
function checkNoTypeArrays(schema: Record<string, unknown>): void {
  if (Array.isArray(schema.type)) {
    throw new Error(`Found un-normalized type array: ${JSON.stringify(schema.type)}`);
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const prop of Object.values(schema.properties as Record<string, unknown>)) {
      if (prop && typeof prop === 'object') {
        checkNoTypeArrays(prop as Record<string, unknown>);
      }
    }
  }

  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    checkNoTypeArrays(schema.items as Record<string, unknown>);
  }

  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[keyword])) {
      for (const sub of schema[keyword] as unknown[]) {
        if (sub && typeof sub === 'object') {
          checkNoTypeArrays(sub as Record<string, unknown>);
        }
      }
    }
  }
}
