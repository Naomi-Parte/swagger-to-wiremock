/**
 * @file CLI integration tests for config subcommand
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const CLI_PATH = resolve(__dirname, '../../dist/cli.js');

let tmpHome: string;

// Use the real wiremock.jar in the project root — guaranteed to exist and pass validation
// realpathSync resolves Windows 8.3 short paths to their long-form equivalents
const fakeJar = realpathSync(resolve(__dirname, '../../wiremock.jar'));

beforeEach(() => {
  // realpathSync normalizes Windows 8.3 short paths (e.g. C:\Users\NPARTI~1\...) to long form
  const resolvedTmpDir = realpathSync(tmpdir());
  tmpHome = join(resolvedTmpDir, `stw-cli-config-${randomBytes(4).toString('hex')}`);
  mkdirSync(tmpHome, { recursive: true });
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(args: string[]): RunResult {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        HOMEDRIVE: tmpHome.slice(0, 2),  // e.g. 'C:'
        HOMEPATH: tmpHome.slice(2),       // e.g. '\Users\...'
      },
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; status?: number | null };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
      status: execError.status ?? 1,
    };
  }
}

describe('cli config', () => {
  it('config set jar saves the path', () => {
    const result = runCli(['config', 'set', 'jar', fakeJar]);
    if (result.status !== 0) console.error('config set jar failed:', result.stderr || result.stdout);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Set jar');

    // Verify file was written
    const configPath = join(tmpHome, '.swagger-to-wiremock', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.jar).toBe(fakeJar);
  });

  it('config get jar shows the configured value', () => {
    // Set first
    runCli(['config', 'set', 'jar', fakeJar]);

    // Then get
    const result = runCli(['config', 'get', 'jar']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('jar:');
    expect(result.stdout).toContain(fakeJar);
  });

  it('config get shows (not set) for unconfigured key', () => {
    const result = runCli(['config', 'get', 'jar']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('not set');
  });

  it('config unset removes the key', () => {
    runCli(['config', 'set', 'jar', fakeJar]);
    const result = runCli(['config', 'unset', 'jar']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Removed');

    // Verify it's gone
    const getResult = runCli(['config', 'get', 'jar']);
    expect(getResult.stdout).toContain('not set');
  });

  it('config list shows all values', () => {
    runCli(['config', 'set', 'jar', fakeJar]);
    runCli(['config', 'set', 'port', '9090']);

    const result = runCli(['config', 'list']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('jar:');
    expect(result.stdout).toContain(fakeJar);
    expect(result.stdout).toContain('port:');
    expect(result.stdout).toContain('9090');
  });

  it('config list shows empty message when nothing set', () => {
    const result = runCli(['config', 'list']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No global config set');
  });

  it('config set rejects unknown keys', () => {
    const result = runCli(['config', 'set', 'unknown', 'value']);
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Unknown global config key');
  });

  it('config get rejects unknown keys', () => {
    const result = runCli(['config', 'get', 'unknown']);
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Unknown global config key');
  });

  it('config set port validates the value', () => {
    const result = runCli(['config', 'set', 'port', 'abc']);
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Invalid port');
  });

  it('config set port accepts valid port', () => {
    const result = runCli(['config', 'set', 'port', '9090']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Set port = 9090');
  });
});
