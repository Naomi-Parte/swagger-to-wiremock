/**
 * @file Tests for WireMock response template builder
 */

import { describe, expect, it } from 'vitest';
import {
  getPathSegmentIndex,
  buildPathParamExpression,
  buildQueryParamExpression,
  buildBodyFieldExpression,
  analyseTemplateSubstitutions,
  applyTemplateSubstitutions,
} from '../../src/generator/template-builder.js';
import type { OperationRecord } from '../../src/types/operation-record.js';

// ─── Helper: minimal OperationRecord factory ─────────────────────────────────

function createRecord(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    id: 'test-id',
    path: '/pets/{petId}',
    method: 'get',
    statusCode: 200,
    pathParams: [{ name: 'petId', type: 'integer', required: true }],
    queryParams: [],
    headers: [],
    contentType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
      },
    },
    ...overrides,
  };
}

// ─── getPathSegmentIndex ─────────────────────────────────────────────────────

describe('getPathSegmentIndex', () => {
  it('should return correct index for a simple path', () => {
    expect(getPathSegmentIndex('/pets/{petId}', 'petId')).toBe(1);
  });

  it('should return correct index for nested path', () => {
    expect(getPathSegmentIndex('/owners/{ownerId}/pets/{petId}', 'ownerId')).toBe(1);
    expect(getPathSegmentIndex('/owners/{ownerId}/pets/{petId}', 'petId')).toBe(3);
  });

  it('should return 0 for first segment parameter', () => {
    expect(getPathSegmentIndex('/{tenantId}/resources', 'tenantId')).toBe(0);
  });

  it('should return -1 for non-existent parameter', () => {
    expect(getPathSegmentIndex('/pets/{petId}', 'ownerId')).toBe(-1);
  });

  it('should handle path with no parameters', () => {
    expect(getPathSegmentIndex('/pets', 'petId')).toBe(-1);
  });
});

// ─── Expression builders ─────────────────────────────────────────────────────

describe('buildPathParamExpression', () => {
  it('should build correct expression for index 0', () => {
    expect(buildPathParamExpression(0)).toBe('{{request.pathSegments.[0]}}');
  });

  it('should build correct expression for index 1', () => {
    expect(buildPathParamExpression(1)).toBe('{{request.pathSegments.[1]}}');
  });

  it('should build correct expression for larger indices', () => {
    expect(buildPathParamExpression(5)).toBe('{{request.pathSegments.[5]}}');
  });
});

describe('buildQueryParamExpression', () => {
  it('should build correct expression', () => {
    expect(buildQueryParamExpression('status')).toBe('{{request.query.status}}');
  });

  it('should handle camelCase param names', () => {
    expect(buildQueryParamExpression('pageSize')).toBe('{{request.query.pageSize}}');
  });
});

describe('buildBodyFieldExpression', () => {
  it('should build dot notation for simple field names', () => {
    expect(buildBodyFieldExpression('name')).toBe("{{jsonPath request.body '$.name'}}");
  });

  it('should build bracket notation for field names with hyphens', () => {
    expect(buildBodyFieldExpression('first-name')).toBe(
      "{{jsonPath request.body '$['first-name']'}}",
    );
  });

  it('should build bracket notation for field names with dots', () => {
    expect(buildBodyFieldExpression('user.name')).toBe(
      "{{jsonPath request.body '$['user.name']'}}",
    );
  });

  it('should use dot notation for underscore fields', () => {
    expect(buildBodyFieldExpression('user_name')).toBe("{{jsonPath request.body '$.user_name'}}");
  });
});

// ─── analyseTemplateSubstitutions ────────────────────────────────────────────

describe('analyseTemplateSubstitutions', () => {
  it('should map path param to response field with same name', () => {
    const record = createRecord({
      path: '/pets/{petId}',
      pathParams: [{ name: 'petId', type: 'integer', required: true }],
      responseSchema: {
        type: 'object',
        properties: {
          petId: { type: 'integer' },
          name: { type: 'string' },
        },
      },
    });

    const result = analyseTemplateSubstitutions(record);

    expect(result.hasTemplating).toBe(true);
    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0]).toEqual({
      field: 'petId',
      expression: '{{request.pathSegments.[1]}}',
      source: 'path',
    });
  });

  it('should map query param to response field with same name', () => {
    const record = createRecord({
      path: '/pets',
      pathParams: [],
      queryParams: [{ name: 'status', type: 'string', required: false }],
      responseSchema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          items: { type: 'array' },
        },
      },
    });

    const result = analyseTemplateSubstitutions(record);

    expect(result.hasTemplating).toBe(true);
    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0]).toEqual({
      field: 'status',
      expression: '{{request.query.status}}',
      source: 'query',
    });
  });

  it('should map request body field to response field with same name', () => {
    const record = createRecord({
      path: '/pets',
      method: 'post',
      pathParams: [],
      requestBodySchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tag: { type: 'string' },
        },
      },
      responseSchema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          tag: { type: 'string' },
        },
      },
    });

    const result = analyseTemplateSubstitutions(record);

    expect(result.hasTemplating).toBe(true);
    expect(result.substitutions).toHaveLength(2);
    expect(result.substitutions.find((s) => s.field === 'name')).toEqual({
      field: 'name',
      expression: "{{jsonPath request.body '$.name'}}",
      source: 'body',
    });
    expect(result.substitutions.find((s) => s.field === 'tag')).toEqual({
      field: 'tag',
      expression: "{{jsonPath request.body '$.tag'}}",
      source: 'body',
    });
  });

  it('should prioritise path param over query param for same field name', () => {
    const record = createRecord({
      path: '/items/{id}',
      pathParams: [{ name: 'id', type: 'integer', required: true }],
      queryParams: [{ name: 'id', type: 'integer', required: false }],
      responseSchema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
        },
      },
    });

    const result = analyseTemplateSubstitutions(record);

    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0]!.source).toBe('path');
  });

  it('should return empty substitutions when response has no schema', () => {
    const record = createRecord({ responseSchema: undefined });

    const result = analyseTemplateSubstitutions(record);

    expect(result.hasTemplating).toBe(false);
    expect(result.substitutions).toEqual([]);
  });

  it('should return empty substitutions when no field names match', () => {
    const record = createRecord({
      path: '/pets/{petId}',
      pathParams: [{ name: 'petId', type: 'integer', required: true }],
      responseSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          breed: { type: 'string' },
        },
      },
    });

    const result = analyseTemplateSubstitutions(record);

    expect(result.hasTemplating).toBe(false);
    expect(result.substitutions).toEqual([]);
  });

  it('should handle multiple path params in a nested path', () => {
    const record = createRecord({
      path: '/owners/{ownerId}/pets/{petId}',
      pathParams: [
        { name: 'ownerId', type: 'integer', required: true },
        { name: 'petId', type: 'integer', required: true },
      ],
      queryParams: [],
      responseSchema: {
        type: 'object',
        properties: {
          ownerId: { type: 'integer' },
          petId: { type: 'integer' },
          name: { type: 'string' },
        },
      },
    });

    const result = analyseTemplateSubstitutions(record);

    expect(result.hasTemplating).toBe(true);
    expect(result.substitutions).toHaveLength(2);
    expect(result.substitutions[0]).toEqual({
      field: 'ownerId',
      expression: '{{request.pathSegments.[1]}}',
      source: 'path',
    });
    expect(result.substitutions[1]).toEqual({
      field: 'petId',
      expression: '{{request.pathSegments.[3]}}',
      source: 'path',
    });
  });

  it('should handle allOf in response schema', () => {
    const record = createRecord({
      path: '/pets/{petId}',
      pathParams: [{ name: 'petId', type: 'integer', required: true }],
      responseSchema: {
        allOf: [
          { type: 'object', properties: { petId: { type: 'integer' } } },
          { type: 'object', properties: { name: { type: 'string' } } },
        ],
      },
    });

    const result = analyseTemplateSubstitutions(record);

    expect(result.hasTemplating).toBe(true);
    expect(result.substitutions[0]!.field).toBe('petId');
  });
});

// ─── applyTemplateSubstitutions ──────────────────────────────────────────────

describe('applyTemplateSubstitutions', () => {
  it('should replace matched fields with template expressions', () => {
    const body = { petId: 42, name: 'Fido', breed: 'Labrador' };
    const substitutions = [
      { field: 'petId', expression: '{{request.pathSegments.[1]}}', source: 'path' as const },
    ];

    const result = applyTemplateSubstitutions(body, substitutions);
    const parsed = JSON.parse(result);

    expect(parsed.petId).toBe('{{request.pathSegments.[1]}}');
    expect(parsed.name).toBe('Fido');
    expect(parsed.breed).toBe('Labrador');
  });

  it('should apply multiple substitutions', () => {
    const body = { id: 1, name: 'Test', status: 'active' };
    const substitutions = [
      { field: 'id', expression: '{{request.pathSegments.[1]}}', source: 'path' as const },
      { field: 'name', expression: "{{jsonPath request.body '$.name'}}", source: 'body' as const },
    ];

    const result = applyTemplateSubstitutions(body, substitutions);
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe('{{request.pathSegments.[1]}}');
    expect(parsed.name).toBe("{{jsonPath request.body '$.name'}}");
    expect(parsed.status).toBe('active');
  });

  it('should handle body that is null', () => {
    const result = applyTemplateSubstitutions(null, []);
    expect(result).toBe('null');
  });

  it('should handle body that is an array (no substitutions possible)', () => {
    const body = [{ id: 1 }, { id: 2 }];
    const substitutions = [
      { field: 'id', expression: '{{request.pathSegments.[1]}}', source: 'path' as const },
    ];

    const result = applyTemplateSubstitutions(body, substitutions);
    // Arrays are returned as-is — top-level substitution doesn't apply
    expect(JSON.parse(result)).toEqual(body);
  });

  it('should not modify fields that do not exist in the body', () => {
    const body = { name: 'Fido' };
    const substitutions = [
      { field: 'petId', expression: '{{request.pathSegments.[1]}}', source: 'path' as const },
    ];

    const result = applyTemplateSubstitutions(body, substitutions);
    const parsed = JSON.parse(result);

    expect(parsed).toEqual({ name: 'Fido' });
  });

  it('should produce valid JSON with template expressions as string values', () => {
    const body = { id: 99, title: 'Hello' };
    const substitutions = [
      { field: 'id', expression: '{{request.pathSegments.[1]}}', source: 'path' as const },
    ];

    const result = applyTemplateSubstitutions(body, substitutions);

    // Should be parseable JSON
    expect(() => JSON.parse(result)).not.toThrow();
  });
});
