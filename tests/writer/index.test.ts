import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { writeStubs } from '../../src/writer/index.js';
import { generateResponseBody } from '../../src/generator/response-builder.js';
import type { OperationRecord } from '../../src/types/operation-record.js';
import type { WireMockMapping } from '../../src/types/wiremock-mapping.js';

const createdDirs: string[] = [];

function createTmpDirPath(name: string): string {
  const dir = join(tmpdir(), `swagger-to-wiremock-${name}-${randomBytes(4).toString('hex')}`);
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function sampleRecords(): OperationRecord[] {
  return [
    {
      id: 'op-1',
      operationId: 'listPets',
      path: '/pets',
      method: 'get',
      statusCode: 200,
      pathParams: [],
      queryParams: [],
      headers: [],
      contentType: 'application/json',
      responseExample: [{ id: 1, name: 'Fido' }],
    },
    {
      id: 'op-2',
      operationId: 'createPets',
      path: '/pets',
      method: 'post',
      statusCode: 201,
      pathParams: [],
      queryParams: [],
      headers: [],
      contentType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: { id: { type: 'integer' }, name: { type: 'string' } },
        required: ['id', 'name'],
      },
    },
  ];
}

function sampleMappings(): WireMockMapping[] {
  return [
    {
      id: 'map-1',
      name: 'GET /pets - 200',
      priority: 1,
      request: { method: 'GET', urlPathPattern: '/pets' },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        bodyFileName: 'get-pets-200.json',
      },
      metadata: { operationId: 'listPets' },
    },
    {
      id: 'map-2',
      name: 'POST /pets - 201',
      priority: 1,
      request: { method: 'POST', urlPathPattern: '/pets' },
      response: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        bodyFileName: 'post-pets-201.json',
      },
      metadata: { operationId: 'createPets' },
    },
  ];
}

function normalizeBodyForAssert(body: unknown): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }

  return body;
}

describe('writeStubs', () => {
  it('writes mappings and body files to correct directories', async () => {
    const outputDir = createTmpDirPath('write-basic');
    const mappings = sampleMappings();
    const records = sampleRecords();

    const result = await writeStubs(mappings, records, { outputDir, flat: true });

    expect(result.mappingFiles).toHaveLength(2);
    expect(result.bodyFiles).toHaveLength(2);

    const mappingPath = join(outputDir, 'mappings', 'get-pets-200.json');
    const bodyPath = join(outputDir, '__files', 'get-pets-200.json');

    await expect(access(mappingPath)).resolves.toBeUndefined();
    await expect(access(bodyPath)).resolves.toBeUndefined();

    const mappingContent = JSON.parse(await readFile(mappingPath, 'utf8')) as WireMockMapping;
    expect(mappingContent).toEqual(mappings[0]);
  });

  it('creates output directories recursively', async () => {
    const outputDir = createTmpDirPath('nested');
    const nested = join(outputDir, 'a', 'b', 'c');

    await writeStubs(sampleMappings(), sampleRecords(), { outputDir: nested, flat: true });

    await expect(access(join(nested, 'mappings'))).resolves.toBeUndefined();
    await expect(access(join(nested, '__files'))).resolves.toBeUndefined();
  });

  it('clean option removes existing directory first', async () => {
    const outputDir = createTmpDirPath('clean');
    await mkdir(outputDir, { recursive: true });
    const oldFile = join(outputDir, 'old.txt');
    await writeFile(oldFile, 'stale', 'utf8');

    await writeStubs(sampleMappings(), sampleRecords(), { outputDir, clean: true, flat: true });

    await expect(access(oldFile)).rejects.toThrow();
    await expect(access(join(outputDir, 'mappings'))).resolves.toBeUndefined();
  });

  it('dry run does not write files', async () => {
    const outputDir = createTmpDirPath('dry-run');
    const result = await writeStubs(sampleMappings(), sampleRecords(), { outputDir, dryRun: true, flat: true });

    expect(result.mappingFiles).toHaveLength(2);
    expect(result.bodyFiles).toHaveLength(2);
    await expect(access(join(outputDir, 'mappings'))).rejects.toThrow();
    await expect(access(join(outputDir, '__files'))).rejects.toThrow();
  });

  it('body files contain generated response body', async () => {
    const outputDir = createTmpDirPath('body-content');
    const mappings = sampleMappings();
    const records = sampleRecords();

    await writeStubs(mappings, records, { outputDir, flat: true });

    const body1Path = join(outputDir, '__files', 'get-pets-200.json');
    const body2Path = join(outputDir, '__files', 'post-pets-201.json');

    const expected1 = normalizeBodyForAssert(generateResponseBody(records[0], 42));
    const expected2 = normalizeBodyForAssert(generateResponseBody(records[1], 42));

    const actual1 = JSON.parse(await readFile(body1Path, 'utf8')) as unknown;
    const actual2 = JSON.parse(await readFile(body2Path, 'utf8')) as unknown;

    expect(actual1).toEqual(expected1);
    expect(actual2).toEqual(expected2);
  });

  it('handles empty mappings array', async () => {
    const outputDir = createTmpDirPath('empty');
    const result = await writeStubs([], [], { outputDir, flat: true });

    expect(result).toEqual({
      mappingFiles: [],
      bodyFiles: [],
      totalBytes: 0,
    });

    const mappingsDirStats = await stat(join(outputDir, 'mappings'));
    const filesDirStats = await stat(join(outputDir, '__files'));
    expect(mappingsDirStats.isDirectory()).toBe(true);
    expect(filesDirStats.isDirectory()).toBe(true);
  });

  it('--empty writes TODO placeholder bodies', async () => {
    const outputDir = createTmpDirPath('empty-flag');
    const mappings = sampleMappings();
    const records = sampleRecords();

    await writeStubs(mappings, records, { outputDir, empty: true, flat: true });

    const body1 = JSON.parse(
      await readFile(join(outputDir, '__files', 'get-pets-200.json'), 'utf8'),
    ) as Record<string, string>;
    const body2 = JSON.parse(
      await readFile(join(outputDir, '__files', 'post-pets-201.json'), 'utf8'),
    ) as Record<string, string>;

    expect(body1).toEqual({ TODO: 'Add response body for GET /pets → 200' });
    expect(body2).toEqual({ TODO: 'Add response body for POST /pets → 201' });
  });

  it('--empty still writes full mappings', async () => {
    const outputDir = createTmpDirPath('empty-flag-mappings');
    const mappings = sampleMappings();
    const records = sampleRecords();

    await writeStubs(mappings, records, { outputDir, empty: true, flat: true });

    const mappingContent = JSON.parse(
      await readFile(join(outputDir, 'mappings', 'get-pets-200.json'), 'utf8'),
    ) as WireMockMapping;

    expect(mappingContent).toEqual(mappings[0]);
    expect(mappingContent.request).toEqual({ method: 'GET', urlPathPattern: '/pets' });
    expect(mappingContent.response.status).toBe(200);
  });

  it('--empty with a filtered record subset combines correctly', async () => {
    const outputDir = createTmpDirPath('empty-flag-filtered');
    const mappings = sampleMappings().slice(0, 1);
    const records = sampleRecords().slice(0, 1);

    const result = await writeStubs(mappings, records, { outputDir, empty: true, flat: true });

    expect(result.mappingFiles).toHaveLength(1);
    expect(result.bodyFiles).toHaveLength(1);

    const body = JSON.parse(
      await readFile(join(outputDir, '__files', 'get-pets-200.json'), 'utf8'),
    ) as Record<string, string>;
    expect(body).toEqual({ TODO: 'Add response body for GET /pets → 200' });
  });

  it('default (no --empty) still generates real bodies', async () => {
    const outputDir = createTmpDirPath('no-empty-flag');
    const mappings = sampleMappings();
    const records = sampleRecords();

    await writeStubs(mappings, records, { outputDir, flat: true });

    const body1 = JSON.parse(await readFile(join(outputDir, '__files', 'get-pets-200.json'), 'utf8')) as unknown;
    expect(body1).not.toEqual({ TODO: expect.any(String) as unknown });
    expect(body1).toEqual(normalizeBodyForAssert(generateResponseBody(records[0], 42)));
  });

  it('split mode (default) writes per-status-class folders, no all/ folder', async () => {
    const outputDir = createTmpDirPath('split-default');
    const mappings = sampleMappings();
    const records = sampleRecords();

    const result = await writeStubs(mappings, records, { outputDir });

    await expect(access(join(outputDir, '2xx', 'mappings', 'get-pets-200.json'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, '2xx', '__files', 'get-pets-200.json'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, '2xx', 'mappings', 'post-pets-201.json'))).resolves.toBeUndefined();
    await expect(access(join(outputDir, 'all'))).rejects.toThrow();

    expect(result.folderCounts).toEqual({ '2xx': 2 });
  });

  it('--empty in split mode produces TODO bodies in each class folder', async () => {
    const outputDir = createTmpDirPath('split-empty');
    const mappings = sampleMappings();
    const records = sampleRecords();

    await writeStubs(mappings, records, { outputDir, empty: true });

    const body2xx = JSON.parse(
      await readFile(join(outputDir, '2xx', '__files', 'get-pets-200.json'), 'utf8'),
    ) as Record<string, string>;

    expect(body2xx).toEqual({ TODO: 'Add response body for GET /pets → 200' });
  });
});
