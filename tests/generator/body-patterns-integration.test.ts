/**
 * @file Integration tests for body pattern generation in the full pipeline
 * @description Verifies that POST/PUT/PATCH endpoints produce bodyPatterns in WireMock mappings
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseOpenAPISpec } from '../../src/parser/index.js';
import { transformSpec } from '../../src/transformer/index.js';
import { generateMappings } from '../../src/generator/index.js';

const PETSTORE_PATH = resolve(__dirname, '../fixtures/specs/petstore.yaml');

describe('body patterns integration', () => {
  it('POST /pets mapping includes bodyPatterns for required fields (id, name)', async () => {
    const spec = await parseOpenAPISpec(PETSTORE_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    // Find the POST /pets mapping (201 response)
    const postPetMapping = mappings.find(
      (m) => m.request.method === 'POST' && m.request.urlPathPattern.includes('pets'),
    );

    expect(postPetMapping).toBeDefined();
    expect(postPetMapping!.request.bodyPatterns).toBeDefined();
    expect(postPetMapping!.request.bodyPatterns!.length).toBeGreaterThan(0);

    // Should match on required fields: id and name
    const jsonPaths = postPetMapping!.request.bodyPatterns!.map((p) => p.matchesJsonPath);
    expect(jsonPaths).toContain('$.id');
    expect(jsonPaths).toContain('$.name');
  });

  it('GET endpoints do not have bodyPatterns', async () => {
    const spec = await parseOpenAPISpec(PETSTORE_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const getMappings = mappings.filter((m) => m.request.method === 'GET');
    expect(getMappings.length).toBeGreaterThan(0);

    for (const mapping of getMappings) {
      expect(mapping.request.bodyPatterns).toBeUndefined();
    }
  });

  it('operations without requestBody do not have bodyPatterns', async () => {
    const spec = await parseOpenAPISpec(PETSTORE_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    // GET /pets and GET /pets/{petId} have no request body
    const listPetsMapping = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/pets -'),
    );
    expect(listPetsMapping).toBeDefined();
    expect(listPetsMapping!.request.bodyPatterns).toBeUndefined();
  });

  it('bodyPatterns are included in deterministic output', async () => {
    const spec = await parseOpenAPISpec(PETSTORE_PATH);
    const records = transformSpec(spec);

    const mappingsA = generateMappings(records, 42);
    const mappingsB = generateMappings(records, 42);

    const postA = mappingsA.find((m) => m.request.method === 'POST');
    const postB = mappingsB.find((m) => m.request.method === 'POST');

    expect(JSON.stringify(postA!.request.bodyPatterns)).toBe(
      JSON.stringify(postB!.request.bodyPatterns),
    );
  });

  it('transformer populates requestBodySchema for POST operations', async () => {
    const spec = await parseOpenAPISpec(PETSTORE_PATH);
    const records = transformSpec(spec);

    const postRecords = records.filter((r) => r.method === 'post');
    expect(postRecords.length).toBeGreaterThan(0);

    for (const record of postRecords) {
      expect(record.requestBodySchema).toBeDefined();
      expect(record.requestBodyRequiredFields).toBeDefined();
      expect(record.requestBodyRequiredFields!.length).toBeGreaterThan(0);
    }
  });

  it('transformer does not populate requestBodySchema for GET operations', async () => {
    const spec = await parseOpenAPISpec(PETSTORE_PATH);
    const records = transformSpec(spec);

    const getRecords = records.filter((r) => r.method === 'get');
    expect(getRecords.length).toBeGreaterThan(0);

    for (const record of getRecords) {
      expect(record.requestBodySchema).toBeUndefined();
    }
  });
});
