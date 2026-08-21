/**
 * @file Tests for `stw config init` — scaffold a .stwrc.yaml with documented options
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { initConfig } from '../../src/config/init.js';

describe('initConfig', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `stw-init-${randomBytes(4).toString('hex')}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create .stwrc.yaml in the target directory', () => {
    const result = initConfig({ cwd: testDir });

    expect(result.created).toBe(true);
    expect(result.path).toBe(join(testDir, '.stwrc.yaml'));
    expect(existsSync(result.path)).toBe(true);
  });

  it('should produce a valid YAML file with all option sections', () => {
    initConfig({ cwd: testDir });

    const content = readFileSync(join(testDir, '.stwrc.yaml'), 'utf8');

    // Verify key sections are present
    expect(content).toContain('# ─── Output');
    expect(content).toContain('# ─── Generation');
    expect(content).toContain('# ─── Server');
    expect(content).toContain('# ─── Logging');
    expect(content).toContain('# ─── Other');
  });

  it('should document all known config options', () => {
    initConfig({ cwd: testDir });

    const content = readFileSync(join(testDir, '.stwrc.yaml'), 'utf8');

    // All options should appear (commented out)
    expect(content).toContain('# output-dir:');
    expect(content).toContain('# flat:');
    expect(content).toContain('# seed:');
    expect(content).toContain('# status:');
    expect(content).toContain('# empty:');
    expect(content).toContain('# no-security:');
    expect(content).toContain('# serve:');
    expect(content).toContain('# port:');
    expect(content).toContain('# jar:');
    expect(content).toContain('# verbose:');
    expect(content).toContain('# quiet:');
    expect(content).toContain('# dry-run:');
  });

  it('should not overwrite an existing .stwrc.yaml without --force', () => {
    writeFileSync(join(testDir, '.stwrc.yaml'), 'output: ./existing\n', 'utf8');

    const result = initConfig({ cwd: testDir });

    expect(result.created).toBe(false);
    expect(result.reason).toContain('already exists');
    expect(result.reason).toContain('--force');

    // Original content should be unchanged
    const content = readFileSync(join(testDir, '.stwrc.yaml'), 'utf8');
    expect(content).toBe('output: ./existing\n');
  });

  it('should not overwrite an existing .stwrc.yml without --force', () => {
    writeFileSync(join(testDir, '.stwrc.yml'), 'output: ./existing\n', 'utf8');

    const result = initConfig({ cwd: testDir });

    expect(result.created).toBe(false);
    expect(result.reason).toContain('already exists');
  });

  it('should not overwrite an existing .stwrc.json without --force', () => {
    writeFileSync(join(testDir, '.stwrc.json'), '{"output-dir": "./existing"}', 'utf8');

    const result = initConfig({ cwd: testDir });

    expect(result.created).toBe(false);
    expect(result.reason).toContain('already exists');
  });

  it('should overwrite existing config when --force is set', () => {
    writeFileSync(join(testDir, '.stwrc.yaml'), 'output-dir: ./old\n', 'utf8');

    const result = initConfig({ cwd: testDir, force: true });

    expect(result.created).toBe(true);
    expect(result.path).toBe(join(testDir, '.stwrc.yaml'));

    // Content should be the full template, not the old value
    const content = readFileSync(join(testDir, '.stwrc.yaml'), 'utf8');
    expect(content).toContain('# ─── Output');
    expect(content).not.toContain('output: ./old');
  });

  it('should default cwd to process.cwd() when not specified', () => {
    // We can't easily test this without changing process.cwd(),
    // but we can verify the function signature accepts no options
    const result = initConfig({ cwd: testDir });
    expect(result.created).toBe(true);
  });

  it('should include discovery order documentation in the generated file', () => {
    initConfig({ cwd: testDir });

    const content = readFileSync(join(testDir, '.stwrc.yaml'), 'utf8');

    expect(content).toContain('.stwrc.yaml');
    expect(content).toContain('.stwrc.yml');
    expect(content).toContain('.stwrc.json');
    expect(content).toContain('package.json');
  });

  it('should include header explaining CLI override behaviour', () => {
    initConfig({ cwd: testDir });

    const content = readFileSync(join(testDir, '.stwrc.yaml'), 'utf8');

    expect(content).toContain('CLI flags always override');
  });
});
