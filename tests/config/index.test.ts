/**
 * @file Tests for global config module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

// We need to mock homedir() to isolate tests from the real user config
let mockHomeDir: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => mockHomeDir,
  };
});

// Import AFTER mocking
import {
  readConfig,
  setConfig,
  getConfig,
  unsetConfig,
  listConfig,
  isValidKey,
  getValidKeys,
  getConfigDir,
  getConfigPath,
} from '../../src/config/index.js';

describe('global config', () => {
  beforeEach(() => {
    mockHomeDir = join(tmpdir(), `stw-config-test-${randomBytes(4).toString('hex')}`);
    mkdirSync(mockHomeDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(mockHomeDir, { recursive: true, force: true });
  });

  describe('getConfigDir / getConfigPath', () => {
    it('returns path under home directory', () => {
      expect(getConfigDir()).toBe(join(mockHomeDir, '.swagger-to-wiremock'));
      expect(getConfigPath()).toBe(join(mockHomeDir, '.swagger-to-wiremock', 'config.json'));
    });
  });

  describe('isValidKey', () => {
    it('accepts "jar" as valid', () => {
      expect(isValidKey('jar')).toBe(true);
    });

    it('accepts "port" as valid', () => {
      expect(isValidKey('port')).toBe(true);
    });

    it('rejects unknown keys', () => {
      expect(isValidKey('foo')).toBe(false);
      expect(isValidKey('path')).toBe(false);
      expect(isValidKey('')).toBe(false);
    });
  });

  describe('getValidKeys', () => {
    it('returns all valid keys', () => {
      const keys = getValidKeys();
      expect(keys).toContain('jar');
      expect(keys).toContain('port');
    });
  });

  describe('readConfig', () => {
    it('returns empty object when no config file exists', () => {
      expect(readConfig()).toEqual({});
    });

    it('returns empty object when config file is malformed JSON', () => {
      const configDir = getConfigDir();
      mkdirSync(configDir, { recursive: true });
      writeFileSync(getConfigPath(), 'not json{{{', 'utf8');

      expect(readConfig()).toEqual({});
    });

    it('returns empty object when config file is a JSON array', () => {
      const configDir = getConfigDir();
      mkdirSync(configDir, { recursive: true });
      writeFileSync(getConfigPath(), '["jar"]', 'utf8');

      expect(readConfig()).toEqual({});
    });

    it('reads valid config', () => {
      const configDir = getConfigDir();
      mkdirSync(configDir, { recursive: true });
      writeFileSync(getConfigPath(), JSON.stringify({ jar: '/path/to/jar' }), 'utf8');

      expect(readConfig()).toEqual({ jar: '/path/to/jar' });
    });
  });

  describe('setConfig', () => {
    it('creates config dir and file when they do not exist', () => {
      setConfig('jar', '/my/wiremock.jar');

      expect(existsSync(getConfigPath())).toBe(true);
      const content = JSON.parse(readFileSync(getConfigPath(), 'utf8'));
      expect(content.jar).toBe('/my/wiremock.jar');
    });

    it('sets jar as a string', () => {
      setConfig('jar', '/path/to/wiremock-standalone-3.3.1.jar');
      expect(getConfig('jar')).toBe('/path/to/wiremock-standalone-3.3.1.jar');
    });

    it('sets port as a number', () => {
      setConfig('port', '9090');
      expect(getConfig('port')).toBe(9090);
    });

    it('throws on invalid port value', () => {
      expect(() => setConfig('port', 'abc')).toThrow('Invalid port value');
    });

    it('throws on port out of range', () => {
      expect(() => setConfig('port', '99999')).toThrow('Invalid port value');
    });

    it('overwrites existing values', () => {
      setConfig('jar', '/old/path.jar');
      setConfig('jar', '/new/path.jar');
      expect(getConfig('jar')).toBe('/new/path.jar');
    });

    it('preserves other keys when setting a new one', () => {
      setConfig('jar', '/my.jar');
      setConfig('port', '8080');
      expect(getConfig('jar')).toBe('/my.jar');
      expect(getConfig('port')).toBe(8080);
    });
  });

  describe('getConfig', () => {
    it('returns undefined for unset keys', () => {
      expect(getConfig('jar')).toBeUndefined();
      expect(getConfig('port')).toBeUndefined();
    });

    it('returns the set value', () => {
      setConfig('jar', '/test.jar');
      expect(getConfig('jar')).toBe('/test.jar');
    });
  });

  describe('unsetConfig', () => {
    it('removes a set key', () => {
      setConfig('jar', '/test.jar');
      unsetConfig('jar');
      expect(getConfig('jar')).toBeUndefined();
    });

    it('does nothing when key was never set', () => {
      // Should not throw
      unsetConfig('jar');
      expect(getConfig('jar')).toBeUndefined();
    });

    it('removes config file when last key is unset', () => {
      setConfig('jar', '/test.jar');
      unsetConfig('jar');
      expect(existsSync(getConfigPath())).toBe(false);
    });

    it('preserves other keys', () => {
      setConfig('jar', '/test.jar');
      setConfig('port', '8080');
      unsetConfig('jar');
      expect(getConfig('jar')).toBeUndefined();
      expect(getConfig('port')).toBe(8080);
    });
  });

  describe('listConfig', () => {
    it('returns empty object when nothing is set', () => {
      expect(listConfig()).toEqual({});
    });

    it('returns all set values', () => {
      setConfig('jar', '/my.jar');
      setConfig('port', '9090');
      expect(listConfig()).toEqual({ jar: '/my.jar', port: 9090 });
    });
  });
});
