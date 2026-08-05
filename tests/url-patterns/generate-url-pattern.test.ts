/**
 * @file Tests for URL pattern generation
 * @description Verify URL patterns are correctly generated from operation records
 */

import { describe, it, expect } from 'vitest';
import { generateURLPattern } from '../../src/url-patterns/index.ts';
import type { OperationRecord } from '../../src/types/operation-record.ts';

describe('URL Pattern Generation', () => {
  describe('generateURLPattern', () => {
    describe('exact match (no parameters)', () => {
      it('should return urlPathEqualTo for paths without parameters', () => {
        const record: OperationRecord = {
          id: 'test-1',
          path: '/pets',
          method: 'get',
          statusCode: 200,
          pathParams: [],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathEqualTo');
        expect(result.url).toBe('/pets');
      });

      it('should preserve exact path including slashes', () => {
        const record: OperationRecord = {
          id: 'test-2',
          path: '/api/v1/users',
          method: 'get',
          statusCode: 200,
          pathParams: [],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathEqualTo');
        expect(result.url).toBe('/api/v1/users');
      });
    });

    describe('regex pattern (with parameters)', () => {
      it('should convert single path parameter to regex pattern', () => {
        const record: OperationRecord = {
          id: 'test-3',
          path: '/pets/{petId}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'petId',
              type: 'string',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/pets/[^/]+');
      });

      it('should convert multiple path parameters to regex pattern', () => {
        const record: OperationRecord = {
          id: 'test-4',
          path: '/orgs/{orgId}/members/{memberId}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'orgId',
              type: 'string',
              required: true,
            },
            {
              name: 'memberId',
              type: 'string',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/orgs/[^/]+/members/[^/]+');
      });
    });

    describe('format-aware parameters', () => {
      it('should use UUID pattern for uuid-formatted parameters', () => {
        const record: OperationRecord = {
          id: 'test-5',
          path: '/users/{userId}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'userId',
              type: 'string',
              format: 'uuid',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/users/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
      });

      it('should use integer pattern for integer-typed parameters', () => {
        const record: OperationRecord = {
          id: 'test-6',
          path: '/posts/{postId}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'postId',
              type: 'integer',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/posts/[0-9]+');
      });

      it('should use date pattern for date-formatted parameters', () => {
        const record: OperationRecord = {
          id: 'test-7',
          path: '/events/{eventDate}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'eventDate',
              type: 'string',
              format: 'date',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/events/\\d{4}-\\d{2}-\\d{2}');
      });

      it('should use boolean pattern for boolean parameters', () => {
        const record: OperationRecord = {
          id: 'test-8',
          path: '/features/{enabled}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'enabled',
              type: 'boolean',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/features/(true|false)');
      });

      it('should use email pattern for email-formatted parameters', () => {
        const record: OperationRecord = {
          id: 'test-9',
          path: '/contacts/{email}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'email',
              type: 'string',
              format: 'email',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/contacts/[^/]+@[^/]+\\.[^/]+');
      });
    });

    describe('mixed parameter types', () => {
      it('should handle multiple parameters with different types', () => {
        const record: OperationRecord = {
          id: 'test-10',
          path: '/users/{userId}/posts/{postId}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'userId',
              type: 'integer',
              required: true,
            },
            {
              name: 'postId',
              type: 'integer',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/users/[0-9]+/posts/[0-9]+');
      });

      it('should handle mixed type and format parameters', () => {
        const record: OperationRecord = {
          id: 'test-11',
          path: '/orgs/{orgId}/events/{eventDate}/details/{detailId}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'orgId',
              type: 'string',
              format: 'uuid',
              required: true,
            },
            {
              name: 'eventDate',
              type: 'string',
              format: 'date',
              required: true,
            },
            {
              name: 'detailId',
              type: 'integer',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe(
          '/orgs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/events/\\d{4}-\\d{2}-\\d{2}/details/[0-9]+',
        );
      });
    });

    describe('default behavior', () => {
      it('should default to generic string pattern when type/format unknown', () => {
        const record: OperationRecord = {
          id: 'test-12',
          path: '/items/{itemCode}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'itemCode',
              type: 'unknown',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/items/[^/]+');
      });

      it('should handle parameter with no type defined', () => {
        const record: OperationRecord = {
          id: 'test-13',
          path: '/search/{query}',
          method: 'get',
          statusCode: 200,
          pathParams: [
            {
              name: 'query',
              required: true,
            },
          ],
          queryParams: [],
          headers: [],
          contentType: 'application/json',
        };

        const result = generateURLPattern(record);
        expect(result.strategy).toBe('urlPathPattern');
        expect(result.url).toBe('/search/[^/]+');
      });
    });
  });
});
