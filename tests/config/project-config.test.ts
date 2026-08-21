/**
 * @file Tests for project-level configuration (`.stwrc.yaml` / `.stwrc.json` / package.json key)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { loadProjectConfig, mergeWithCliOptions } from '../../src/config/project-config.js';
import type { ProjectConfig } from '../../src/config/project-config.js';

describe('project-config', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `stw-project-config-${randomBytes(4).toString('hex')}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadProjectConfig', () => {
    it('should return empty config when no config file exists', () => {
      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({});
      expect(result.source).toBeNull();
    });

    it('should load .stwrc.yaml', () => {
      const configContent = `output-dir: ./wiremock-stubs\nseed: 42\nflat: true\n`;
      writeFileSync(join(testDir, '.stwrc.yaml'), configContent, 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({ 'output-dir': './wiremock-stubs', seed: 42, flat: true });
      expect(result.source).toBe(join(testDir, '.stwrc.yaml'));
    });

    it('should load .stwrc.yml', () => {
      const configContent = `output-dir: ./stubs\nport: 9090\n`;
      writeFileSync(join(testDir, '.stwrc.yml'), configContent, 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({ 'output-dir': './stubs', port: 9090 });
      expect(result.source).toBe(join(testDir, '.stwrc.yml'));
    });

    it('should load .stwrc.json', () => {
      const config = { 'output-dir': './json-stubs', seed: 99, 'no-security': true };
      writeFileSync(join(testDir, '.stwrc.json'), JSON.stringify(config), 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual(config);
      expect(result.source).toBe(join(testDir, '.stwrc.json'));
    });

    it('should prefer .stwrc.yaml over .stwrc.yml', () => {
      writeFileSync(join(testDir, '.stwrc.yaml'), 'output-dir: ./from-yaml\n', 'utf8');
      writeFileSync(join(testDir, '.stwrc.yml'), 'output-dir: ./from-yml\n', 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config['output-dir']).toBe('./from-yaml');
      expect(result.source).toBe(join(testDir, '.stwrc.yaml'));
    });

    it('should prefer .stwrc.yml over .stwrc.json', () => {
      writeFileSync(join(testDir, '.stwrc.yml'), 'output-dir: ./from-yml\n', 'utf8');
      writeFileSync(join(testDir, '.stwrc.json'), JSON.stringify({ 'output-dir': './from-json' }), 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config['output-dir']).toBe('./from-yml');
    });

    it('should load from package.json "swagger-to-wiremock" key', () => {
      const pkg = {
        name: 'my-project',
        version: '1.0.0',
        'swagger-to-wiremock': { 'output-dir': './pkg-stubs', flat: true },
      };
      writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg), 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({ 'output-dir': './pkg-stubs', flat: true });
      expect(result.source).toBe(join(testDir, 'package.json'));
    });

    it('should prefer rc file over package.json', () => {
      writeFileSync(join(testDir, '.stwrc.yaml'), 'output-dir: ./from-rc\n', 'utf8');
      const pkg = {
        name: 'my-project',
        'swagger-to-wiremock': { 'output-dir': './from-pkg' },
      };
      writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg), 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config['output-dir']).toBe('./from-rc');
    });

    it('should ignore package.json without swagger-to-wiremock key', () => {
      const pkg = { name: 'my-project', version: '1.0.0' };
      writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg), 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({});
      expect(result.source).toBeNull();
    });

    it('should ignore malformed YAML gracefully', () => {
      writeFileSync(join(testDir, '.stwrc.yaml'), '{{{{not valid yaml', 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({});
      expect(result.source).toBeNull();
    });

    it('should ignore malformed JSON gracefully', () => {
      writeFileSync(join(testDir, '.stwrc.json'), 'not json at all', 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({});
      expect(result.source).toBeNull();
    });

    it('should walk up to parent directories looking for config', () => {
      const childDir = join(testDir, 'packages', 'api');
      mkdirSync(childDir, { recursive: true });

      // Put config in testDir (ancestor directory)
      writeFileSync(join(testDir, '.stwrc.yaml'), 'output-dir: ./from-parent\n', 'utf8');

      const result = loadProjectConfig(childDir);
      expect(result.config['output-dir']).toBe('./from-parent');
      expect(result.source).toBe(join(testDir, '.stwrc.yaml'));
    });

    it('should support all option keys in YAML', () => {
      const configContent = [
        'output-dir: ./all-opts',
        'seed: 123',
        'flat: true',
        'status: 2xx,4xx',
        'no-security: true',
        'port: 9090',
        'jar: /path/to/wiremock.jar',
        'empty: true',
        'verbose: true',
        'serve: true',
        'dry-run: true',
      ].join('\n');
      writeFileSync(join(testDir, '.stwrc.yaml'), configContent, 'utf8');

      const result = loadProjectConfig(testDir);
      expect(result.config).toEqual({
        'output-dir': './all-opts',
        seed: 123,
        flat: true,
        status: '2xx,4xx',
        'no-security': true,
        port: 9090,
        jar: '/path/to/wiremock.jar',
        empty: true,
        verbose: true,
        serve: true,
        'dry-run': true,
      });
    });
  });

  describe('mergeWithCliOptions', () => {
    const defaults: Record<string, unknown> = {
      output: './wiremock',
      outputDir: undefined,
      seed: undefined,
      verbose: undefined,
      quiet: undefined,
      clean: true,
      dryRun: undefined,
      status: undefined,
      empty: undefined,
      flat: undefined,
      serve: undefined,
      security: true,
      port: undefined,
      jar: undefined,
    };

    it('should apply project config when CLI uses defaults', () => {
      const projectConfig: ProjectConfig = { 'output-dir': './custom-stubs', seed: 99, flat: true };
      const cliOptions = { ...defaults };

      const merged = mergeWithCliOptions(projectConfig, cliOptions, defaults);

      expect(merged.outputDir).toBe('./custom-stubs');
      expect(merged.seed).toBe('99');
      expect(merged.flat).toBe(true);
    });

    it('should let CLI flags override project config', () => {
      const projectConfig: ProjectConfig = { 'output-dir': './from-config', seed: 42 };
      const cliOptions = { ...defaults, outputDir: './from-cli', seed: '77' };

      const merged = mergeWithCliOptions(projectConfig, cliOptions, defaults);

      expect(merged.outputDir).toBe('./from-cli');
      expect(merged.seed).toBe('77');
    });

    it('should map no-security: true to security: false', () => {
      const projectConfig: ProjectConfig = { 'no-security': true };
      const cliOptions = { ...defaults };

      const merged = mergeWithCliOptions(projectConfig, cliOptions, defaults);

      expect(merged.security).toBe(false);
    });

    it('should not override security if CLI explicitly set --no-security', () => {
      const projectConfig: ProjectConfig = { 'no-security': false }; // config says keep security
      const cliOptions = { ...defaults, security: false }; // CLI says --no-security

      const merged = mergeWithCliOptions(projectConfig, cliOptions, defaults);

      // CLI wins — security remains false
      expect(merged.security).toBe(false);
    });

    it('should convert port to string', () => {
      const projectConfig: ProjectConfig = { port: 9090 };
      const cliOptions = { ...defaults };

      const merged = mergeWithCliOptions(projectConfig, cliOptions, defaults);

      expect(merged.port).toBe('9090');
    });

    it('should not touch options that have no project config equivalent', () => {
      const projectConfig: ProjectConfig = { 'output-dir': './stubs' };
      const cliOptions = { ...defaults, clean: true };

      const merged = mergeWithCliOptions(projectConfig, cliOptions, defaults);

      expect(merged.clean).toBe(true);
    });

    it('should handle empty project config (no-op)', () => {
      const projectConfig: ProjectConfig = {};
      const cliOptions = { ...defaults };

      const merged = mergeWithCliOptions(projectConfig, cliOptions, defaults);

      expect(merged).toEqual(cliOptions);
    });
  });
});
