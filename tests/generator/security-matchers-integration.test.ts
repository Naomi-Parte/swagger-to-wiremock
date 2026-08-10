/**
 * @file Integration tests for security scheme matchers in the full pipeline
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { parseOpenAPISpec } from '../../src/parser/index.js';
import { transformSpec } from '../../src/transformer/index.js';
import { generateMappings } from '../../src/generator/index.js';

const SECURED_SPEC_PATH = resolve(__dirname, '../fixtures/specs/petstore-secured.yaml');

describe('security matchers integration', () => {
  it('GET /pets has Authorization header matcher (global bearer auth)', async () => {
    const spec = await parseOpenAPISpec(SECURED_SPEC_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const listPets = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/pets -'),
    );
    expect(listPets).toBeDefined();
    expect(listPets!.request.headers).toBeDefined();
    expect(listPets!.request.headers!['Authorization']).toBeDefined();
    expect(listPets!.request.headers!['Authorization'].matches).toContain('Bearer');
  });

  it('POST /pets has X-API-Key header matcher (operation-level apiKey)', async () => {
    const spec = await parseOpenAPISpec(SECURED_SPEC_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const createPet = mappings.find(
      (m) => m.request.method === 'POST' && m.name.includes('/pets -'),
    );
    expect(createPet).toBeDefined();
    expect(createPet!.request.headers).toBeDefined();
    expect(createPet!.request.headers!['X-API-Key']).toBeDefined();
    expect(createPet!.request.headers!['X-API-Key'].matches).toBe('.+');
  });

  it('GET /pets/{petId} has Basic auth header matcher', async () => {
    const spec = await parseOpenAPISpec(SECURED_SPEC_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const getPet = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/pets/{petId}'),
    );
    expect(getPet).toBeDefined();
    expect(getPet!.request.headers).toBeDefined();
    expect(getPet!.request.headers!['Authorization'].matches).toBe('Basic .+');
  });

  it('GET /public/health has NO auth headers (security: [])', async () => {
    const spec = await parseOpenAPISpec(SECURED_SPEC_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const health = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/public/health'),
    );
    expect(health).toBeDefined();
    // Should have no headers at all (GET, no Content-Type, no auth)
    expect(health!.request.headers).toBeUndefined();
  });

  it('GET /admin/stats has api_key query parameter matcher', async () => {
    const spec = await parseOpenAPISpec(SECURED_SPEC_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const stats = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/admin/stats'),
    );
    expect(stats).toBeDefined();
    expect(stats!.request.queryParameters).toBeDefined();
    expect(stats!.request.queryParameters!['api_key']).toBeDefined();
    expect(stats!.request.queryParameters!['api_key'].matches).toBe('.+');
  });

  it('GET /oauth/resource has Authorization header matcher (OAuth2)', async () => {
    const spec = await parseOpenAPISpec(SECURED_SPEC_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const oauth = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/oauth/resource'),
    );
    expect(oauth).toBeDefined();
    expect(oauth!.request.headers).toBeDefined();
    expect(oauth!.request.headers!['Authorization']).toBeDefined();
  });

  it('GET /mtls/resource has NO auth headers (mTLS skipped)', async () => {
    const spec = await parseOpenAPISpec(SECURED_SPEC_PATH);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    const mtls = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/mtls/resource'),
    );
    expect(mtls).toBeDefined();
    // mTLS produces no matchers — no headers
    expect(mtls!.request.headers).toBeUndefined();
  });

  it('existing specs without security still work (no regression)', async () => {
    const petstorePath = resolve(__dirname, '../fixtures/specs/petstore.yaml');
    const spec = await parseOpenAPISpec(petstorePath);
    const records = transformSpec(spec);
    const mappings = generateMappings(records, 42);

    // GET /pets should not have auth headers
    const listPets = mappings.find(
      (m) => m.request.method === 'GET' && m.name.includes('/pets -'),
    );
    expect(listPets).toBeDefined();
    expect(listPets!.request.headers).toBeUndefined();
  });
});
