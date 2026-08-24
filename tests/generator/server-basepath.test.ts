/**
 * @file Integration tests for server base path in generated mappings
 * @description Verifies end-to-end: parse → transform (with server path) → generate
 */

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { parseOpenAPISpec } from '../../src/parser/index.ts';
import { transformSpec } from '../../src/transformer/index.ts';
import { generateMappings } from '../../src/generator/index.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'specs');

describe('Server base path in generated mappings', () => {
  describe('static server path (no variables)', () => {
    it('prepends server base path to urlPathPattern by default', async () => {
      const spec = await parseOpenAPISpec(join(FIXTURES, 'server-basepath.yaml'), { quiet: true });
      const records = transformSpec(spec);
      const mappings = generateMappings(records, { seed: 1 });

      // POST /messages → should have full path
      const postMessage = mappings.find((m) => m.request.method === 'POST');
      expect(postMessage).toBeDefined();
      expect(postMessage!.request.urlPathPattern).toBe(
        '/msd/obligationmanagement/obligations/v1/messages',
      );

      // GET /messages/{messageId} → should have full path with regex
      const getMessage = mappings.find((m) => m.request.method === 'GET');
      expect(getMessage).toBeDefined();
      expect(getMessage!.request.urlPathPattern).toContain(
        '/msd/obligationmanagement/obligations/v1/messages/',
      );
    });

    it('excludes server base path when noServerPath=true', async () => {
      const spec = await parseOpenAPISpec(join(FIXTURES, 'server-basepath.yaml'), { quiet: true });
      const records = transformSpec(spec, { noServerPath: true });
      const mappings = generateMappings(records, { seed: 1 });

      const postMessage = mappings.find((m) => m.request.method === 'POST');
      expect(postMessage!.request.urlPathPattern).toBe('/messages');
    });
  });

  describe('server path with variables', () => {
    it('strips variable segments by default', async () => {
      const spec = await parseOpenAPISpec(join(FIXTURES, 'server-variables.yaml'), { quiet: true });
      const records = transformSpec(spec);
      const mappings = generateMappings(records, { seed: 1 });

      const listing = mappings.find((m) => m.request.method === 'GET');
      expect(listing).toBeDefined();
      // {subenv} should be stripped → only /msd/obligations/v1/messages
      expect(listing!.request.urlPathPattern).toBe('/msd/obligations/v1/messages');
    });

    it('includes variable segments as regex with includeVariables=true', async () => {
      const spec = await parseOpenAPISpec(join(FIXTURES, 'server-variables.yaml'), { quiet: true });
      const records = transformSpec(spec, {
        serverPath: { includeVariables: true },
      });
      const mappings = generateMappings(records, { seed: 1 });

      const listing = mappings.find((m) => m.request.method === 'GET');
      expect(listing).toBeDefined();
      // {subenv} → [^/]+
      expect(listing!.request.urlPathPattern).toBe('/[^/]+/msd/obligations/v1/messages');
    });
  });

  describe('server index selection', () => {
    it('uses specified server index', async () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        servers: [
          { url: 'https://sit.example.com/api/v1' },
          { url: 'https://uat.example.com/api/v2' },
        ],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: {
                '200': {
                  description: 'OK',
                  content: { 'application/json': { schema: { type: 'object' } } },
                },
              },
            },
          },
        },
      };

      // Default (index 0)
      const records0 = transformSpec(spec as Record<string, unknown>);
      const mappings0 = generateMappings(records0, { seed: 1 });
      expect(mappings0[0]!.request.urlPathPattern).toBe('/api/v1/users');

      // Index 1
      const records1 = transformSpec(spec as Record<string, unknown>, {
        serverPath: { serverIndex: 1 },
      });
      const mappings1 = generateMappings(records1, { seed: 1 });
      expect(mappings1[0]!.request.urlPathPattern).toBe('/api/v2/users');
    });
  });

  describe('petstore fixture (has /v1 server path)', () => {
    it('prepends /v1 from server URL to all paths', async () => {
      const spec = await parseOpenAPISpec(join(FIXTURES, 'petstore.yaml'), { quiet: true });
      const records = transformSpec(spec);
      const mappings = generateMappings(records, { seed: 42 });

      // Petstore has servers: [{url: "http://petstore.swagger.io/v1"}]
      // All paths should now start with /v1/
      for (const mapping of mappings) {
        expect(mapping.request.urlPathPattern).toMatch(/^\/v1\//);
      }
    });
  });
});
