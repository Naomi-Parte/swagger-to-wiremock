import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdir, readdir, rm } from 'fs/promises';
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
    const mappingFiles = await readdir(join(outputDir, 'mappings'));
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

    const mappingsA = (await readdir(join(outputDirA, 'mappings'))).sort();
    const mappingsB = (await readdir(join(outputDirB, 'mappings'))).sort();
    expect(mappingsA).toEqual(mappingsB);

    const bodiesA = (await readdir(join(outputDirA, '__files'))).sort();
    const bodiesB = (await readdir(join(outputDirB, '__files'))).sort();
    expect(bodiesA).toEqual(bodiesB);
  });
});
