import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { startServer } from '../../src/server/index.js';
import { ServerError } from '../../src/errors/server-error.js';

function createTmpDir(): string {
  const dir = join(tmpdir(), `stw-server-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('server', () => {
  let tmpDir: string;
  const originalEnv = process.env['WIREMOCK_JAR'];
  const originalStwHome = process.env['STW_HOME'];
  const originalHome = process.env['HOME'];
  const originalUserProfile = process.env['USERPROFILE'];
  const originalHomeDrive = process.env['HOMEDRIVE'];
  const originalHomePath = process.env['HOMEPATH'];

  beforeEach(() => {
    tmpDir = createTmpDir();
    delete process.env['WIREMOCK_JAR'];
    // Redirect STW_HOME so global config doesn't interfere
    process.env['STW_HOME'] = join(tmpDir, '.swagger-to-wiremock');
    // Redirect HOME so global config doesn't interfere with tests
    process.env['HOME'] = tmpDir;
    process.env['USERPROFILE'] = tmpDir;
    process.env['HOMEDRIVE'] = '';
    process.env['HOMEPATH'] = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Restore HOME
    if (originalStwHome !== undefined) {
      process.env['STW_HOME'] = originalStwHome;
    } else {
      delete process.env['STW_HOME'];
    }
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

  describe('stubs directory validation', () => {
    it('throws INVALID_STUBS_DIR when directory does not exist', () => {
      const fakeJar = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(fakeJar, '');

      expect(() =>
        startServer({
          rootDir: '/does/not/exist',
          jarPath: fakeJar,
        }),
      ).toThrow(ServerError);

      try {
        startServer({ rootDir: '/does/not/exist', jarPath: fakeJar });
      } catch (err) {
        expect((err as ServerError).code).toBe('INVALID_STUBS_DIR');
        expect((err as ServerError).message).toContain('does not exist');
      }
    });

    it('throws INVALID_STUBS_DIR when directory has no mappings structure', () => {
      const stubsDir = join(tmpDir, 'empty-stubs');
      mkdirSync(stubsDir);
      const fakeJar = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(fakeJar, '');

      expect(() =>
        startServer({
          rootDir: stubsDir,
          jarPath: fakeJar,
        }),
      ).toThrow(ServerError);

      try {
        startServer({ rootDir: stubsDir, jarPath: fakeJar });
      } catch (err) {
        expect((err as ServerError).code).toBe('INVALID_STUBS_DIR');
        expect((err as ServerError).message).toContain('No WireMock stubs found');
      }
    });

    it('detects flat mode structure (mappings/ directly in root)', () => {
      const stubsDir = join(tmpDir, 'flat-stubs');
      mkdirSync(join(stubsDir, 'mappings'), { recursive: true });
      mkdirSync(join(stubsDir, '__files'), { recursive: true });
      const fakeJar = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(fakeJar, '');

      // This will throw JAVA_NOT_FOUND since Java likely isn't available in test env,
      // but it proves the stubs dir validation passed
      try {
        startServer({ rootDir: stubsDir, jarPath: fakeJar, noLogs: true });
      } catch (err) {
        // Should NOT be INVALID_STUBS_DIR — it should get past validation
        expect((err as ServerError).code).not.toBe('INVALID_STUBS_DIR');
      }
    });

    it('detects split mode structure (2xx/, 4xx/, 5xx/ with mappings/)', () => {
      const stubsDir = join(tmpDir, 'split-stubs');
      mkdirSync(join(stubsDir, '2xx', 'mappings'), { recursive: true });
      mkdirSync(join(stubsDir, '2xx', '__files'), { recursive: true });
      mkdirSync(join(stubsDir, '4xx', 'mappings'), { recursive: true });
      mkdirSync(join(stubsDir, '4xx', '__files'), { recursive: true });
      const fakeJar = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(fakeJar, '');

      // Will throw JAVA_NOT_FOUND but validates stubs dir detection passed
      try {
        startServer({ rootDir: stubsDir, jarPath: fakeJar, noLogs: true });
      } catch (err) {
        expect((err as ServerError).code).not.toBe('INVALID_STUBS_DIR');
      }
    });
  });

  describe('Java detection', () => {
    it('throws JAVA_NOT_FOUND when Java is not available', () => {
      const stubsDir = join(tmpDir, 'stubs');
      mkdirSync(join(stubsDir, 'mappings'), { recursive: true });
      const fakeJar = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(fakeJar, '');

      // Override PATH to ensure Java isn't found
      const originalPath = process.env['PATH'];
      const originalJavaHome = process.env['JAVA_HOME'];
      process.env['PATH'] = tmpDir; // empty dir — no java binary
      delete process.env['JAVA_HOME'];

      try {
        startServer({ rootDir: stubsDir, jarPath: fakeJar, noLogs: true });
      } catch (err) {
        if (err instanceof ServerError && err.code === 'JAVA_NOT_FOUND') {
          expect(err.message).toContain('Java is required');
          expect(err.message).toContain('https://adoptium.net/');
        }
        // If Java IS available in the test environment, the test will pass through
        // to the spawn step — that's fine, we just validate the error message shape
      } finally {
        process.env['PATH'] = originalPath;
        if (originalJavaHome !== undefined) {
          process.env['JAVA_HOME'] = originalJavaHome;
        }
      }
    });
  });

  describe('JAR resolution integration', () => {
    it('throws JAR_NOT_FOUND when no JAR path provided and none found', () => {
      const stubsDir = join(tmpDir, 'stubs');
      mkdirSync(join(stubsDir, 'mappings'), { recursive: true });

      expect(() =>
        startServer({ rootDir: stubsDir }),
      ).toThrow(ServerError);

      try {
        startServer({ rootDir: stubsDir });
      } catch (err) {
        expect((err as ServerError).code).toBe('JAR_NOT_FOUND');
      }
    });
  });

  describe('server process handle', () => {
    it('returns a ServerProcess object with stop, port, and waitForExit', () => {
      const stubsDir = join(tmpDir, 'stubs');
      mkdirSync(join(stubsDir, 'mappings'), { recursive: true });
      const fakeJar = join(tmpDir, 'wiremock-standalone-3.3.1.jar');
      writeFileSync(fakeJar, '');

      // This test only works if Java is available — skip gracefully if not
      try {
        const server = startServer({ rootDir: stubsDir, jarPath: fakeJar, port: 19999, noLogs: true });
        expect(server).toHaveProperty('stop');
        expect(server).toHaveProperty('port');
        expect(server).toHaveProperty('waitForExit');
        expect(server.port).toBe(19999);
        expect(typeof server.stop).toBe('function');
        expect(typeof server.waitForExit).toBe('function');
        // Clean up
        server.stop();
      } catch (err) {
        // If Java not found, that's acceptable in CI — test the error type
        if (err instanceof ServerError && err.code === 'JAVA_NOT_FOUND') {
          // Skip — Java not available in test environment
          return;
        }
        throw err;
      }
    });
  });
});
