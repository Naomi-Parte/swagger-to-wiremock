/**
 * @file Tests for extract-params.ts
 */

import { describe, it, expect } from 'vitest';
import {
  extractPathParamNames,
  extractOperationParams,
} from '../../src/transformer/extract-params.js';

describe('extractPathParamNames', () => {
  it('should extract single path param', () => {
    expect(extractPathParamNames('/pets/{petId}')).toEqual(['petId']);
  });

  it('should extract multiple path params', () => {
    expect(extractPathParamNames('/orgs/{orgId}/members/{memberId}')).toEqual([
      'orgId',
      'memberId',
    ]);
  });

  it('should return empty array for no params', () => {
    expect(extractPathParamNames('/pets')).toEqual([]);
  });

  it('should handle complex paths', () => {
    expect(extractPathParamNames('/users/{userId}/posts/{postId}/comments/{commentId}')).toEqual([
      'userId',
      'postId',
      'commentId',
    ]);
  });
});

describe('extractOperationParams', () => {
  it('should extract query parameters', () => {
    const operation = {
      parameters: [
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer' },
          required: false,
        },
        {
          name: 'offset',
          in: 'query',
          schema: { type: 'integer' },
          required: true,
        },
      ],
    };

    const result = extractOperationParams(operation, []);
    expect(result.queryParams).toHaveLength(2);
    expect(result.queryParams[0]).toEqual({ name: 'limit', type: 'integer', required: false });
    expect(result.queryParams[1]).toEqual({ name: 'offset', type: 'integer', required: true });
  });

  it('should extract header parameters', () => {
    const operation = {
      parameters: [
        {
          name: 'X-Request-ID',
          in: 'header',
          schema: { type: 'string' },
          required: true,
        },
      ],
    };

    const result = extractOperationParams(operation, []);
    expect(result.headers).toHaveLength(1);
    expect(result.headers[0]).toEqual({
      name: 'X-Request-ID',
      type: 'string',
      required: true,
    });
  });

  it('should extract path parameters from parameters array', () => {
    const operation = {
      parameters: [
        {
          name: 'petId',
          in: 'path',
          schema: { type: 'string', format: 'uuid' },
          required: true,
        },
      ],
    };

    const result = extractOperationParams(operation, ['petId']);
    expect(result.pathParams).toHaveLength(1);
    expect(result.pathParams[0]).toEqual({
      name: 'petId',
      type: 'string',
      format: 'uuid',
      required: true,
    });
  });

  it('should include path params from path template even if not in parameters', () => {
    const operation = { parameters: [] };
    const result = extractOperationParams(operation, ['petId', 'orgId']);

    expect(result.pathParams).toHaveLength(2);
    expect(result.pathParams.map((p) => p.name)).toEqual(['petId', 'orgId']);
  });

  it('should extract enum values', () => {
    const operation = {
      parameters: [
        {
          name: 'status',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
          },
          required: true,
        },
      ],
    };

    const result = extractOperationParams(operation, []);
    expect(result.queryParams[0].enum).toEqual(['active', 'inactive', 'pending']);
  });

  it('should extract pattern', () => {
    const operation = {
      parameters: [
        {
          name: 'code',
          in: 'query',
          schema: {
            type: 'string',
            pattern: '^[A-Z]{3}$',
          },
        },
      ],
    };

    const result = extractOperationParams(operation, []);
    expect(result.queryParams[0].pattern).toBe('^[A-Z]{3}$');
  });

  it('should handle missing parameters array', () => {
    const operation = {};
    const result = extractOperationParams(operation, []);

    expect(result.pathParams).toHaveLength(0);
    expect(result.queryParams).toHaveLength(0);
    expect(result.headers).toHaveLength(0);
  });
});
