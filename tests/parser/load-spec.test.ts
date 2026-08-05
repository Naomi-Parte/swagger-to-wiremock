/**
 * @file Tests for load-spec.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadSpecFromFile } from '../../src/parser/load-spec.js';
import { ParserError } from '../../src/errors/parser-error.js';

const testDir = join(process.cwd(), '.test-specs');

describe('loadSpecFromFile', () => {
  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load valid JSON spec', () => {
    const specPath = join(testDir, 'spec.json');
    const specContent = { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' } };
    writeFileSync(specPath, JSON.stringify(specContent));

    const result = loadSpecFromFile(specPath);
    expect(result.openapi).toBe('3.0.0');
    expect(result.info).toEqual({ title: 'Test', version: '1.0.0' });

    unlinkSync(specPath);
  });

  it('should load valid YAML spec with .yaml extension', () => {
    const specPath = join(testDir, 'spec.yaml');
    const specContent = `openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0`;
    writeFileSync(specPath, specContent);

    const result = loadSpecFromFile(specPath);
    expect(result.openapi).toBe('3.0.0');
    expect((result.info as any).title).toBe('Test API');

    unlinkSync(specPath);
  });

  it('should load valid YAML spec with .yml extension', () => {
    const specPath = join(testDir, 'spec.yml');
    const specContent = `openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0`;
    writeFileSync(specPath, specContent);

    const result = loadSpecFromFile(specPath);
    expect(result.openapi).toBe('3.0.0');

    unlinkSync(specPath);
  });

  it('should throw INVALID_FILE for missing file', () => {
    expect(() => loadSpecFromFile(join(testDir, 'nonexistent.json'))).toThrow(ParserError);
    try {
      loadSpecFromFile(join(testDir, 'nonexistent.json'));
    } catch (error) {
      expect((error as ParserError).code).toBe('INVALID_FILE');
      expect((error as ParserError).message).toContain('not found');
    }
  });

  it('should throw PARSE_ERROR for invalid JSON/YAML', () => {
    const specPath = join(testDir, 'invalid.json');
    writeFileSync(specPath, '\x00\x01\x02\x03');  // Binary garbage, not valid JSON or YAML

    expect(() => loadSpecFromFile(specPath)).toThrow(ParserError);
    try {
      loadSpecFromFile(specPath);
    } catch (error) {
      expect((error as ParserError).code).toBe('PARSE_ERROR');
    }

    unlinkSync(specPath);
  });

  it('should throw PARSE_ERROR for invalid YAML', () => {
    const specPath = join(testDir, 'invalid.yaml');
    writeFileSync(specPath, ': invalid: yaml: : :');

    expect(() => loadSpecFromFile(specPath)).toThrow(ParserError);
    try {
      loadSpecFromFile(specPath);
    } catch (error) {
      expect((error as ParserError).code).toBe('PARSE_ERROR');
    }

    unlinkSync(specPath);
  });

  it('should include filePath in error context', () => {
    const filePath = join(testDir, 'missing.json');
    try {
      loadSpecFromFile(filePath);
    } catch (error) {
      expect((error as ParserError).context?.filePath).toBe(filePath);
    }
  });
});
