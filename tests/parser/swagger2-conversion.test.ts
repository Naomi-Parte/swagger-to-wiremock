/**
 * @file Tests for Swagger 2.0 auto-conversion
 * @description Covers detection, conversion, and integration with parseOpenAPISpec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { isSwagger2 } from '../../src/parser/swagger2-detector.js';
import { convertSwagger2ToOpenApi3 } from '../../src/parser/swagger2-converter.js';
import { parseOpenAPISpec } from '../../src/parser/index.js';
import { ParserError } from '../../src/errors/parser-error.js';
import { loadSpecFromFile } from '../../src/parser/load-spec.js';
import { convertObj } from 'swagger2openapi';

vi.mock('swagger2openapi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swagger2openapi')>();
  return {
    ...actual,
    convertObj: vi.fn(actual.convertObj),
  };
});

const FIXTURES = resolve(__dirname, '../fixtures/specs');

describe('isSwagger2', () => {
  it('returns true for a Swagger 2.0 spec', () => {
    expect(isSwagger2({ swagger: '2.0' })).toBe(true);
  });

  it('returns false for an OpenAPI 3.0 spec', () => {
    expect(isSwagger2({ openapi: '3.0.3' })).toBe(false);
  });

  it('returns false for non-object input', () => {
    expect(isSwagger2(null)).toBe(false);
    expect(isSwagger2(undefined)).toBe(false);
    expect(isSwagger2('swagger: 2.0')).toBe(false);
  });
});

describe('convertSwagger2ToOpenApi3', () => {
  it('converts a Swagger 2.0 YAML spec and produces an OpenAPI 3.0 document', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.yaml'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);

    expect((openapi as Record<string, unknown>).openapi).toMatch(/^3\.0/);
    expect(openapi).not.toHaveProperty('swagger');
  });

  it('converts a Swagger 2.0 JSON spec and produces an OpenAPI 3.0 document', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.json'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);

    expect((openapi as Record<string, unknown>).openapi).toMatch(/^3\.0/);
  });

  it('preserves all paths from the original Swagger 2.0 spec', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.yaml'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);
    const paths = (openapi as Record<string, unknown>).paths as Record<string, unknown>;

    expect(Object.keys(paths).sort()).toEqual(['/pets', '/pets/{petId}']);
  });

  it('preserves path parameters through conversion', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.yaml'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const petByIdGet = (openapi as any).paths['/pets/{petId}'].get;
    const petIdParam = petByIdGet.parameters.find((p: { name: string }) => p.name === 'petId');

    expect(petIdParam).toBeDefined();
    expect(petIdParam.in).toBe('path');
    expect(petIdParam.required).toBe(true);
  });

  it('preserves response schemas through conversion', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.yaml'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const components = (openapi as any).components;

    expect(components.schemas.Pet).toBeDefined();
    expect(components.schemas.Pets).toBeDefined();
    expect(components.schemas.Error).toBeDefined();
  });

  it('handles Swagger 2.0 definitions section, converting it to components/schemas', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'swagger2-with-definitions.yaml'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schemas = (openapi as any).components.schemas;

    expect(schemas.Widget).toBeDefined();
    expect(schemas.Category).toBeDefined();
    expect(schemas.WidgetList).toBeDefined();
  });

  it('handles Swagger 2.0 produces/consumes fields, mapping to content types in 3.0', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.yaml'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getPetsResponse = (openapi as any).paths['/pets'].get.responses['200'];

    expect(getPetsResponse.content['application/json']).toBeDefined();
  });

  it('handles Swagger 2.0 form data parameters, converting them to requestBody', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'swagger2-form-data.yaml'));
    const { openapi } = await convertSwagger2ToOpenApi3(spec);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadPost = (openapi as any).paths['/upload'].post;

    expect(uploadPost.requestBody).toBeDefined();
    expect(uploadPost.requestBody.content['multipart/form-data']).toBeDefined();
  });

  it('produces deterministic output across repeated conversions', async () => {
    const spec = loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.yaml'));
    const first = await convertSwagger2ToOpenApi3(loadSpecFromFile(resolve(FIXTURES, 'petstore-swagger2.yaml')));
    const second = await convertSwagger2ToOpenApi3(spec);

    expect(first.openapi).toEqual(second.openapi);
  });

  it('throws ParserError when swagger2openapi conversion fails', async () => {
    vi.mocked(convertObj).mockRejectedValueOnce(new Error('boom: unrecoverable parse failure'));

    await expect(convertSwagger2ToOpenApi3({ swagger: '2.0' })).rejects.toThrow(ParserError);

    vi.mocked(convertObj).mockRejectedValueOnce(new Error('boom: unrecoverable parse failure'));
    try {
      await convertSwagger2ToOpenApi3({ swagger: '2.0' });
    } catch (error) {
      expect((error as ParserError).code).toBe('SWAGGER2_CONVERSION_ERROR');
      expect((error as ParserError).message).toContain('Swagger 2.0 auto-conversion failed');
      expect((error as ParserError).message).toContain('editor.swagger.io');
    }
  });
});

describe('parseOpenAPISpec — Swagger 2.0 integration', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs info messages when Swagger 2.0 is detected (default verbosity)', async () => {
    await parseOpenAPISpec(resolve(FIXTURES, 'petstore-swagger2.yaml'));

    const logged = logSpy.mock.calls.map((call) => call[0]);
    expect(logged.some((line) => String(line).includes('Swagger 2.0 detected'))).toBe(true);
    expect(logged.some((line) => String(line).includes('Converted successfully'))).toBe(true);
  });

  it('does not log conversion message for OpenAPI 3.0 specs', async () => {
    await parseOpenAPISpec(resolve(FIXTURES, 'petstore.yaml'));

    const logged = logSpy.mock.calls.map((call) => call[0]);
    expect(logged.some((line) => String(line).includes('Swagger 2.0 detected'))).toBe(false);
  });

  it('suppresses info logs in quiet mode', async () => {
    await parseOpenAPISpec(resolve(FIXTURES, 'petstore-swagger2.yaml'), { quiet: true });

    const logged = logSpy.mock.calls.map((call) => call[0]);
    expect(logged.some((line) => String(line).includes('Swagger 2.0 detected'))).toBe(false);
  });

  it('parses a Swagger 2.0 YAML spec end-to-end into a valid OpenAPI 3.0 document', async () => {
    const spec = await parseOpenAPISpec(resolve(FIXTURES, 'petstore-swagger2.yaml'));

    expect((spec.openapi as string)).toMatch(/^3\.0/);
    expect(spec.paths).toBeDefined();
  });

  it('parses a Swagger 2.0 JSON spec end-to-end into a valid OpenAPI 3.0 document', async () => {
    const spec = await parseOpenAPISpec(resolve(FIXTURES, 'petstore-swagger2.json'));

    expect((spec.openapi as string)).toMatch(/^3\.0/);
    expect(spec.paths).toBeDefined();
  });

  it('continues to work unchanged for OpenAPI 3.0 specs', async () => {
    const spec = await parseOpenAPISpec(resolve(FIXTURES, 'petstore.yaml'));

    expect((spec.openapi as string)).toBe('3.0.3');
  });

  it('throws ParserError with an actionable message when Swagger 2.0 conversion fails', async () => {
    const specPath = resolve(FIXTURES, 'petstore-swagger2.yaml');
    vi.mocked(convertObj).mockRejectedValueOnce(new Error('invalid definition'));

    await expect(parseOpenAPISpec(specPath)).rejects.toThrow(ParserError);

    vi.mocked(convertObj).mockRejectedValueOnce(new Error('invalid definition'));
    try {
      await parseOpenAPISpec(specPath);
    } catch (error) {
      expect((error as ParserError).code).toBe('SWAGGER2_CONVERSION_ERROR');
      expect((error as ParserError).message).toContain('Swagger 2.0 auto-conversion failed');
    }
  });
});
