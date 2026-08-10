/**
 * @file Tests for normalize-schema.ts
 * @description Unit tests for OpenAPI 3.1 schema normalization
 */

import { describe, it, expect } from 'vitest';
import { normalizeSchema } from '../../src/transformer/normalize-schema.js';

describe('normalizeSchema', () => {
  describe('type arrays', () => {
    it('converts type: ["string", "null"] to type: "string"', () => {
      const schema = { type: ['string', 'null'] };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.type).toBe('string');
    });

    it('converts type: ["integer", "null"] to type: "integer"', () => {
      const schema = { type: ['integer', 'null'] };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.type).toBe('integer');
    });

    it('picks first non-null type when multiple non-null types present', () => {
      const schema = { type: ['string', 'number', 'null'] };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.type).toBe('string');
    });

    it('handles type array with only non-null types', () => {
      const schema = { type: ['string', 'number'] };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.type).toBe('string');
    });

    it('handles type array with only null (edge case)', () => {
      const schema = { type: ['null'] };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.type).toBe('string'); // fallback
    });

    it('does not modify a single string type', () => {
      const schema = { type: 'string' };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.type).toBe('string');
    });

    it('removes nullable when type array is present', () => {
      const schema = { type: ['string', 'null'], nullable: true };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.type).toBe('string');
      expect(result.nullable).toBeUndefined();
    });
  });

  describe('const keyword', () => {
    it('converts const to enum with single value', () => {
      const schema = { const: 'active' };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.enum).toEqual(['active']);
      expect(result.const).toBeUndefined();
    });

    it('handles const with number value', () => {
      const schema = { const: 42 };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.enum).toEqual([42]);
      expect(result.const).toBeUndefined();
    });

    it('handles const with boolean value', () => {
      const schema = { const: true };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.enum).toEqual([true]);
    });
  });

  describe('prefixItems', () => {
    it('converts single prefixItems to items schema', () => {
      const schema = {
        type: 'array',
        prefixItems: [{ type: 'string' }],
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.items).toEqual({ type: 'string' });
      expect(result.prefixItems).toBeUndefined();
    });

    it('converts multiple prefixItems to items with oneOf', () => {
      const schema = {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }],
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.items).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }],
      });
      expect(result.prefixItems).toBeUndefined();
    });
  });

  describe('$defs', () => {
    it('renames $defs to definitions', () => {
      const schema = {
        type: 'object',
        $defs: {
          Name: { type: 'string' },
        },
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      expect(result.definitions).toEqual({ Name: { type: 'string' } });
      expect(result.$defs).toBeUndefined();
    });

    it('normalizes schemas within $defs', () => {
      const schema = {
        type: 'object',
        $defs: {
          NullableName: { type: ['string', 'null'] },
        },
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      const definitions = result.definitions as Record<string, Record<string, unknown>>;
      expect(definitions.NullableName.type).toBe('string');
    });
  });

  describe('recursive normalization', () => {
    it('normalizes nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
          age: { type: 'integer' },
        },
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      const props = result.properties as Record<string, Record<string, unknown>>;
      expect(props.name.type).toBe('string');
      expect(props.age.type).toBe('integer');
    });

    it('normalizes items schema in arrays', () => {
      const schema = {
        type: 'array',
        items: { type: ['string', 'null'] },
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      const items = result.items as Record<string, unknown>;
      expect(items.type).toBe('string');
    });

    it('normalizes schemas in allOf', () => {
      const schema = {
        allOf: [
          { type: 'object', properties: { a: { type: ['string', 'null'] } } },
          { type: 'object', properties: { b: { const: 'fixed' } } },
        ],
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      const allOf = result.allOf as Record<string, unknown>[];
      const propsA = (allOf[0] as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
      const propsB = (allOf[1] as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
      expect(propsA.a.type).toBe('string');
      expect(propsB.b.enum).toEqual(['fixed']);
    });

    it('normalizes schemas in oneOf', () => {
      const schema = {
        oneOf: [{ type: ['string', 'null'] }, { type: 'integer' }],
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      const oneOf = result.oneOf as Record<string, unknown>[];
      expect(oneOf[0]!.type).toBe('string');
      expect(oneOf[1]!.type).toBe('integer');
    });

    it('normalizes additionalProperties', () => {
      const schema = {
        type: 'object',
        additionalProperties: { type: ['number', 'null'] },
      };
      const result = normalizeSchema(schema) as Record<string, unknown>;
      const addProps = result.additionalProperties as Record<string, unknown>;
      expect(addProps.type).toBe('number');
    });
  });

  describe('passthrough', () => {
    it('returns null/undefined as-is', () => {
      expect(normalizeSchema(null)).toBeNull();
      expect(normalizeSchema(undefined)).toBeUndefined();
    });

    it('returns primitives as-is', () => {
      expect(normalizeSchema(42)).toBe(42);
      expect(normalizeSchema('hello')).toBe('hello');
      expect(normalizeSchema(true)).toBe(true);
    });

    it('does not mutate the original schema', () => {
      const original = { type: ['string', 'null'], const: 'test' };
      const copy = JSON.parse(JSON.stringify(original));
      normalizeSchema(original);
      expect(original).toEqual(copy);
    });
  });
});
