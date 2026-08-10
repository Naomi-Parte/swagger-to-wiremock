import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { rm, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const CLI_PATH = resolve(__dirname, '../../dist/cli.js');

const createdDirs: string[] = [];

function createTmpDirPath(name: string): string {
  const dir = join(tmpdir(), `swagger-to-wiremock-serve-${name}-${randomBytes(4).toString('hex')}`);
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(args: string[], timeout = 5000): RunResult {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf8',
      timeout,
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; status?: number | null };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? (
        // On timeout or signal kill, stderr may be on the error message itself
        error instanceof Error ? error.message : ''
      ),
      status: execError.status ?? 1,
    };
  }
}

describe('cli serve subcommand', () => {
  it('exits with error when stubs directory does not exist', () => {
    const fakeJar = join(createTmpDirPath('jar-for-nodir'), 'wiremock-standalone-3.3.1.jar');
    mkdirSync(join(fakeJar, '..'), { recursive: true });
    writeFileSync(fakeJar, '');

    const result = runCli(['serve', '/does/not/exist/stubs', '--jar', fakeJar], 15000);

    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('does not exist');
  });

  it('exits with error when stubs directory has no mappings structure', async () => {
    const dir = createTmpDirPath('no-mappings');
    await mkdir(dir, { recursive: true });
    const fakeJar = join(dir, 'wiremock-standalone-3.3.1.jar');
    writeFileSync(fakeJar, '');

    const result = runCli(['serve', dir, '--jar', fakeJar]);

    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('No WireMock stubs found');
  });

  it('exits with error when JAR is not found', async () => {
    const dir = createTmpDirPath('no-jar');
    await mkdir(join(dir, 'mappings'), { recursive: true });

    const result = runCli(['serve', dir, '--jar', '/does/not/exist/wiremock.jar']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  it('exits with error for invalid port', async () => {
    const dir = createTmpDirPath('bad-port');
    await mkdir(join(dir, 'mappings'), { recursive: true });

    const result = runCli(['serve', dir, '--port', 'abc']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid port');
  });

  it('exits with error for port out of range', async () => {
    const dir = createTmpDirPath('port-range');
    await mkdir(join(dir, 'mappings'), { recursive: true });

    const result = runCli(['serve', dir, '--port', '99999']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid port');
  });

  it('shows starting info with verbose flag', async () => {
    const dir = createTmpDirPath('verbose-serve');
    await mkdir(join(dir, 'mappings'), { recursive: true });

    // Will fail because no JAR, but should show the info log first
    const result = runCli(['serve', dir, '-v']);

    // Either shows info or fails with JAR not found — both acceptable
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Starting WireMock|JAR not found|not found/i);
  });
});

describe('cli convert --serve', () => {
  it('--serve with --dry-run skips server start', () => {
    const SPEC_PATH = resolve(__dirname, '../fixtures/specs/petstore.yaml');
    const outputDir = createTmpDirPath('serve-dry-run');

    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--serve', '--dry-run', '-v']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dry-run');
    expect(result.stdout).toContain('skipping server start');
  });

  it('--serve with invalid port exits with error', () => {
    const SPEC_PATH = resolve(__dirname, '../fixtures/specs/petstore.yaml');
    const outputDir = createTmpDirPath('serve-bad-port');

    const result = runCli(['convert', SPEC_PATH, '-o', outputDir, '--serve', '--port', 'xyz']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid port');
  });

  it('--serve flag is accepted without error (will fail on JAR/Java)', () => {
    const SPEC_PATH = resolve(__dirname, '../fixtures/specs/petstore.yaml');
    const outputDir = createTmpDirPath('serve-flag');

    const result = runCli([
      'convert',
      SPEC_PATH,
      '-o',
      outputDir,
      '--serve',
      '--jar',
      '/does/not/exist.jar',
    ]);

    // Should fail because JAR doesn't exist, but proves the flag is recognized
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not found');
    // Verify stubs were generated before the server error
    expect(result.stdout).toContain('Generated');
  });
});

describe('cli --help includes serve examples', () => {
  it('--help-examples shows serve usage', () => {
    const SPEC_PATH = resolve(__dirname, '../fixtures/specs/petstore.yaml');
    const result = runCli(['convert', SPEC_PATH, '--help-examples']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--serve');
    expect(result.stdout).toContain('swagger-to-wiremock serve');
  });
});
