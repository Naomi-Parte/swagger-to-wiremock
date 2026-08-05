/**
 * @file Tests for extract-responses.ts
 */

import { describe, it, expect } from 'vitest';
import { extractOperationResponses } from '../../src/transformer/extract-responses.js';

describe('extractOperationResponses', () => {
  it('should extract simple response with example', () => {
    const operation = {
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              example: { id: 1, name: 'Fido' },
              schema: { type: 'object' },
            },
          },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toEqual({
      statusCode: 200,
      contentType: 'application/json',
      example: { id: 1, name: 'Fido' },
      schema: { type: 'object' },
    });
  });

  it('should extract multiple status codes', () => {
    const operation = {
      responses: {
        '200': {
          description: 'Success',
          content: { 'application/json': { example: { success: true } } },
        },
        '400': {
          description: 'Bad request',
          content: { 'application/json': { example: { error: 'Invalid' } } },
        },
        '500': {
          description: 'Server error',
          content: { 'application/json': { example: { error: 'Internal' } } },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses).toHaveLength(3);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 400, 500]);
  });

  it('should extract schema when no example present', () => {
    const operation = {
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses[0].example).toBeUndefined();
    expect(responses[0].schema).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('should prefer example over schema example', () => {
    const operation = {
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              example: { from: 'media-type' },
              schema: {
                type: 'object',
                example: { from: 'schema' },
              },
            },
          },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses[0].example).toEqual({ from: 'media-type' });
  });

  it('should extract schema example when no media type example', () => {
    const operation = {
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                example: { from: 'schema' },
              },
            },
          },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses[0].example).toEqual({ from: 'schema' });
  });

  it('should extract first example from examples object', () => {
    const operation = {
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              examples: {
                example1: { value: { id: 1 } },
                example2: { value: { id: 2 } },
              },
              schema: { type: 'object' },
            },
          },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses[0].example).toEqual({ id: 1 });
  });

  it('should prefer JSON content type', () => {
    const operation = {
      responses: {
        '200': {
          description: 'Success',
          content: {
            'text/plain': { example: 'plain' },
            'application/json': { example: { json: true } },
          },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses[0].contentType).toBe('application/json');
    expect(responses[0].example).toEqual({ json: true });
  });

  it('should handle responses without content', () => {
    const operation = {
      responses: {
        '204': {
          description: 'No content',
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toEqual({
      statusCode: 204,
      contentType: 'application/json',
      example: undefined,
      schema: undefined,
    });
  });

  it('should skip non-numeric status codes, but include "default" as 500', () => {
    const operation = {
      responses: {
        '200': { description: 'OK', content: { 'application/json': {} } },
        default: { description: 'Default', content: { 'application/json': {} } },
        '4XX': { description: 'Client error' },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses).toHaveLength(2); // 200 and default (→ 500)
    expect(responses[0].statusCode).toBe(200);
    expect(responses[1].statusCode).toBe(500); // default mapped to 500
  });

  it('should handle "default" responses mapped to 500', () => {
    const operation = {
      responses: {
        '200': {
          description: 'OK',
          content: { 'application/json': { example: [] } },
        },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      },
    };

    const responses = extractOperationResponses(operation);
    expect(responses).toHaveLength(2);
    expect(responses[0].statusCode).toBe(200);
    expect(responses[1].statusCode).toBe(500); // default mapped to 500
  });
});
