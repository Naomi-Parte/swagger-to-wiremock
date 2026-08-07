import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const CLI_PATH = resolve(__dirname, '../../dist/cli.js');
const SPEC_PATH = resolve(__dirname, '../fixtures/specs/petstore.yaml');

const createdDirs: string[] = [];

function createTmpDirPath(name: string): string {
  const dir = join(tmpdir(), `openapi-to-wiremock-cli-${name}-${randomBytes(4).toString('hex')}`);
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface RunResult {
  stdout: string;
  status: number;
}

function runCli(args: string[]): RunResult {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], { encoding: 'utf8' });
    return { stdout, status: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; status?: number | null };
    return { stdout: execError.stdout ?? '', status: execError.status ?? 1 };
  }
}

describe('cli convert', () => {
  it('converts spec and writes output', async () => {
    const outputDir = createTmpDirPath('basic');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('✅ Generated');
    expect(result.stdout).toContain('Folders:');

    const mappingFiles = await readdir(join(outputDir, '2xx', 'mappings'));
    const bodyFiles = await readdir(join(outputDir, '2xx', '__files'));
    expect(mappingFiles.length).toBeGreaterThan(0);
    expect(bodyFiles.length).toBeGreaterThan(0);
    await expect(access(join(outputDir, 'all'))).rejects.toThrow();
  });

  it('--flat writes a single mappings/__files folder', async () => {
    const outputDir = createTmpDirPath('flat');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--flat']);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('Folders:');

    const mappingFiles = await readdir(join(outputDir, 'mappings'));
    const bodyFiles = await readdir(join(outputDir, '__files'));
    expect(mappingFiles.length).toBeGreaterThan(0);
    expect(bodyFiles.length).toBeGreaterThan(0);
  });

  it('exits with code 1 on invalid input', async () => {
    const outputDir = createTmpDirPath('invalid');
    const missingSpec = join(outputDir, 'does-not-exist.yaml');
    await mkdir(outputDir, { recursive: true });

    const result = runCli(['convert', missingSpec, '-o', join(outputDir, 'out')]);

    expect(result.status).toBe(1);
  });

  it('respects --output flag', async () => {
    const outputDir = createTmpDirPath('custom-output');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir]);

    expect(result.status).toBe(0);
    const mappingFiles = await readdir(join(outputDir, '2xx', 'mappings'));
    expect(mappingFiles.length).toBeGreaterThan(0);
  });

  it('verbose flag shows info logs', () => {
    const outputDir = createTmpDirPath('verbose');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '-v']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[info]');
  });

  it('is deterministic with same seed', async () => {
    const outputDirA = createTmpDirPath('seed-a');
    const outputDirB = createTmpDirPath('seed-b');

    const resultA = runCli(['convert', SPEC_PATH, '-o', outputDirA, '-s', '42']);
    const resultB = runCli(['convert', SPEC_PATH, '-o', outputDirB, '-s', '42']);

    expect(resultA.status).toBe(0);
    expect(resultB.status).toBe(0);

    const mappingsA = (await readdir(join(outputDirA, '2xx', 'mappings'))).sort();
    const mappingsB = (await readdir(join(outputDirB, '2xx', 'mappings'))).sort();
    expect(mappingsA).toEqual(mappingsB);

    const bodiesA = (await readdir(join(outputDirA, '2xx', '__files'))).sort();
    const bodiesB = (await readdir(join(outputDirB, '2xx', '__files'))).sort();
    expect(bodiesA).toEqual(bodiesB);
  });

  it('--dry-run does not create files', async () => {
    const outputDir = createTmpDirPath('dry-run');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--dry-run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[dry-run]');

    await expect(access(outputDir)).rejects.toThrow();
  });

  it('--no-clean preserves existing files', async () => {
    const outputDir = createTmpDirPath('no-clean');
    await mkdir(join(outputDir, 'mappings'), { recursive: true });
    await mkdir(join(outputDir, '__files'), { recursive: true });
    await writeFile(join(outputDir, 'mappings', 'existing.json'), '{}', 'utf8');

    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--no-clean', '--flat']);

    expect(result.status).toBe(0);
    const mappingFiles = await readdir(join(outputDir, 'mappings'));
    expect(mappingFiles).toContain('existing.json');
    expect(mappingFiles.length).toBeGreaterThan(1);
  });

  it('--quiet suppresses output', () => {
    const outputDir = createTmpDirPath('quiet');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '-q']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('--help-examples prints examples', () => {
    const result = runCli(['convert', SPEC_PATH, '--help-examples']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Examples:');
    expect(result.stdout).toContain('openapi-to-wiremock convert');
  });

  it('invalid seed exits with code 1', () => {
    const outputDir = createTmpDirPath('invalid-seed');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '-s', 'abc']);

    expect(result.status).toBe(1);
  });

  it('--status 400 generates placeholder mappings for all endpoints', async () => {
    const outputDir = createTmpDirPath('status-placeholder');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--status', '400', '-v']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('generating placeholders for all endpoints');
    expect(result.stdout).toContain('not defined in spec — placeholder mappings generated');

    const mappingFiles = await readdir(join(outputDir, '4xx', 'mappings'));
    const bodyFiles = await readdir(join(outputDir, '4xx', '__files'));
    expect(mappingFiles).toHaveLength(3);
    expect(bodyFiles).toHaveLength(3);
    await expect(access(join(outputDir, 'all'))).rejects.toThrow();
  });

  it('--status 2xx splits into only the 2xx/ folder, no all/', async () => {
    const outputDir = createTmpDirPath('status-2xx');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--status', '2xx']);

    expect(result.status).toBe(0);
    const mappingFiles = await readdir(join(outputDir, '2xx', 'mappings'));
    expect(mappingFiles.length).toBeGreaterThan(0);
    await expect(access(join(outputDir, 'all'))).rejects.toThrow();
  });

  it('--empty combined with split mode writes TODO bodies in class folders', async () => {
    const outputDir = createTmpDirPath('empty-split');
    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--empty']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Empty templates');

    const files = await readdir(join(outputDir, '2xx', '__files'));
    const firstBody = JSON.parse(
      await readFile(join(outputDir, '2xx', '__files', files[0]!), 'utf8'),
    ) as Record<string, string>;
    expect(firstBody.TODO).toContain('Add response body for');
    await expect(access(join(outputDir, 'all'))).rejects.toThrow();
  });
});
