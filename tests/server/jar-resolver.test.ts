import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { resolveJarPath } from '../../src/server/jar-resolver.js';
import { ServerError } from '../../src/errors/server-error.js';

function createTmpDir(): string {
  const dir = join(tmpdir(), `stw-jar-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('jar-resolver', () => {
  let tmpDir: string;
  const originalEnv = process.env['WIREMOCK_JAR'];
  const originalHome = process.env['HOME'];
  const originalUserProfile = process.env['USERPROFILE'];
  const originalHomeDrive = process.env['HOMEDRIVE'];
  const originalHomePath = process.env['HOMEPATH'];

  beforeEach(() => {
    tmpDir = createTmpDir();
    delete process.env['WIREMOCK_JAR'];
    // Redirect HOME so global config doesn't interfere with tests
    process.env['HOME'] = tmpDir;
    process.env['USERPROFILE'] = tmpDir;
    process.env['HOMEDRIVE'] = '';
    process.env['HOMEPATH'] = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Restore HOME
    process.env['HOME'] = originalHome;
    process.env['USERPROFILE'] = originalUserProfile;
    process.env['HOMEDRIVE'] = originalHomeDrive;
    process.env['HOMEPATH'] = originalHomePath;
    if (originalEnv !== undefined) {
      process.env['WIREMOCK_JAR'] = originalEnv;
    } else {
      delete process.env['WIREMOCK_JAR'];
    }
  });

  describe('explicit path (--jar)', () => {
    it('returns the explicit path when file exists', () => {
      const jarPath = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(jarPath, '');

      const result = resolveJarPath({ explicitPath: jarPath, cwd: tmpDir });
      expect(result).toBe(jarPath);
    });

    it('resolves relative explicit paths against cwd', () => {
      const jarPath = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(jarPath, '');

      const result = resolveJarPath({ explicitPath: 'wiremock-standalone-3.3.1.jar', cwd: tmpDir });
      expect(result).toBe(jarPath);
    });

    it('throws JAR_NOT_FOUND when explicit path does not exist', () => {
      expect(() =>
        resolveJarPath({ explicitPath: '/does/not/exist/wiremock.jar', cwd: tmpDir }),
      ).toThrow(ServerError);

      try {
        resolveJarPath({ explicitPath: '/does/not/exist/wiremock.jar', cwd: tmpDir });
      } catch (err) {
        expect(err).toBeInstanceOf(ServerError);
        expect((err as ServerError).code).toBe('JAR_NOT_FOUND');
        expect((err as ServerError).message).toContain('not found at specified path');
      }
    });
  });

  describe('WIREMOCK_JAR env variable', () => {
    it('uses WIREMOCK_JAR when no explicit path is provided', () => {
      const jarPath = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(jarPath, '');
      process.env['WIREMOCK_JAR'] = jarPath;

      const result = resolveJarPath({ cwd: tmpDir });
      expect(result).toBe(jarPath);
    });

    it('throws JAR_NOT_FOUND when WIREMOCK_JAR path does not exist', () => {
      process.env['WIREMOCK_JAR'] = '/does/not/exist/wiremock.jar';

      expect(() => resolveJarPath({ cwd: tmpDir })).toThrow(ServerError);

      try {
        resolveJarPath({ cwd: tmpDir });
      } catch (err) {
        expect((err as ServerError).code).toBe('JAR_NOT_FOUND');
        expect((err as ServerError).message).toContain('WIREMOCK_JAR');
      }
    });

    it('explicit path takes priority over WIREMOCK_JAR', () => {
      const explicitJar = join(tmpDir, 'explicit.jar');
      const envJar = join(tmpDir, 'env.jar');
      writeFileSync(explicitJar, '');
      writeFileSync(envJar, '');
      process.env['WIREMOCK_JAR'] = envJar;

      const result = resolveJarPath({ explicitPath: explicitJar, cwd: tmpDir });
      expect(result).toBe(explicitJar);
    });
  });

  describe('auto-detect', () => {
    it('finds JAR in cwd', () => {
      const jarPath = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(jarPath, '');

      const result = resolveJarPath({ cwd: tmpDir });
      expect(result).toBe(jarPath);
    });

    it('finds JAR in ./wiremock/ subdirectory', () => {
      const wmDir = join(tmpDir, 'wiremock');
      mkdirSync(wmDir);
      const jarPath = join(wmDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(jarPath, '');

      const result = resolveJarPath({ cwd: tmpDir });
      expect(result).toBe(jarPath);
    });

    it('finds JAR in ./lib/ subdirectory', () => {
      const libDir = join(tmpDir, 'lib');
      mkdirSync(libDir);
      const jarPath = join(libDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(jarPath, '');

      const result = resolveJarPath({ cwd: tmpDir });
      expect(result).toBe(jarPath);
    });

    it('prefers standalone variant over plain wiremock JAR', () => {
      const standalone = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      const plain = join(tmpDir, 'wiremock-3.3.1.jar');
      writeFileSync(standalone, '');
      writeFileSync(plain, '');

      const result = resolveJarPath({ cwd: tmpDir });
      expect(result).toBe(standalone);
    });

    it('matches various JAR naming conventions', () => {
      const jarPath = join(tmpDir, 'wiremock-3.0.0.jar');
      writeFileSync(jarPath, '');

      const result = resolveJarPath({ cwd: tmpDir });
      expect(result).toBe(jarPath);
    });

    it('throws JAR_NOT_FOUND with helpful message when nothing found', () => {
      expect(() => resolveJarPath({ cwd: tmpDir })).toThrow(ServerError);

      try {
        resolveJarPath({ cwd: tmpDir });
      } catch (err) {
        expect((err as ServerError).code).toBe('JAR_NOT_FOUND');
        expect((err as ServerError).message).toContain('--jar');
        expect((err as ServerError).message).toContain('WIREMOCK_JAR');
        expect((err as ServerError).message).toContain('https://wiremock.org');
      }
    });
  });
});
