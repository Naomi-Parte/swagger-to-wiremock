/**
 * @file Project-level configuration discovery and parsing
 * @description Discovers and loads `.stwrc.yaml`, `.stwrc.yml`, `.stwrc.json`, or
 *   a `"swagger-to-wiremock"` key in `package.json` — giving teams a zero-flag
 *   experience when shared defaults are committed to the repo.
 *
 * Discovery order (first match wins):
 *   1. `.stwrc.yaml` in cwd
 *   2. `.stwrc.yml` in cwd
 *   3. `.stwrc.json` in cwd
 *   4. Walk up directories until git root (`.git/` found) checking each level
 *   5. `package.json` → `"swagger-to-wiremock"` key (in cwd or git root)
 *
 * CLI flags always override project config values.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import yaml from 'js-yaml';

/**
 * Project config shape — mirrors CLI option names.
 * All values are optional; only present keys override defaults.
 */
export interface ProjectConfig {
  output?: string;
  seed?: number;
  flat?: boolean;
  status?: string;
  'no-security'?: boolean;
  port?: number;
  jar?: string;
  empty?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  serve?: boolean;
  'dry-run'?: boolean;
  templated?: boolean;
}

/** File names to search for, in priority order */
const CONFIG_FILE_NAMES = ['.stwrc.yaml', '.stwrc.yml', '.stwrc.json'];

/**
 * Walk up from `startDir` until we find a `.git/` directory (the repo root).
 * Returns the directory containing `.git/`, or null if not found.
 */
function findGitRoot(startDir: string): string | null {
  let current = resolve(startDir);
  const root = dirname(current) === current ? current : undefined; // filesystem root guard

  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  return null;
}

/**
 * Attempt to read and parse a config file at `filePath`.
 * Returns the parsed config or null if the file doesn't exist / is invalid.
 */
function tryReadConfigFile(filePath: string): ProjectConfig | null {
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf8');

    if (filePath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null;
      }
      return parsed as ProjectConfig;
    }

    // YAML
    const parsed = yaml.load(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Attempt to read the `"swagger-to-wiremock"` key from a `package.json` file.
 */
function tryReadPackageJson(dir: string): ProjectConfig | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const content = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(content);

    if (
      typeof pkg === 'object' &&
      pkg !== null &&
      typeof pkg['swagger-to-wiremock'] === 'object' &&
      pkg['swagger-to-wiremock'] !== null &&
      !Array.isArray(pkg['swagger-to-wiremock'])
    ) {
      return pkg['swagger-to-wiremock'] as ProjectConfig;
    }

    return null;
  } catch {
    return null;
  }
}

export interface LoadProjectConfigResult {
  config: ProjectConfig;
  /** Path to the config file that was loaded, or null if none found */
  source: string | null;
}

/**
 * Discover and load the project-level configuration.
 *
 * @param cwd - Directory to start searching from (defaults to `process.cwd()`)
 * @returns The loaded config and its source path
 */
export function loadProjectConfig(cwd: string = process.cwd()): LoadProjectConfigResult {
  const resolvedCwd = resolve(cwd);
  const dirsToCheck: string[] = [resolvedCwd];

  // Find git root and add intermediate directories
  const gitRoot = findGitRoot(resolvedCwd);
  if (gitRoot && gitRoot !== resolvedCwd) {
    // Walk up from cwd to git root, checking each directory
    let current = dirname(resolvedCwd);
    while (current !== gitRoot && current !== dirname(current)) {
      dirsToCheck.push(current);
      current = dirname(current);
    }
    dirsToCheck.push(gitRoot);
  }

  // Search for rc files in each directory
  for (const dir of dirsToCheck) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = join(dir, fileName);
      const config = tryReadConfigFile(filePath);
      if (config) {
        return { config, source: filePath };
      }
    }
  }

  // Fall back to package.json key (check cwd first, then git root)
  for (const dir of dirsToCheck) {
    const config = tryReadPackageJson(dir);
    if (config) {
      return { config, source: join(dir, 'package.json') };
    }
  }

  return { config: {}, source: null };
}

/**
 * Merge project config into CLI options. CLI flags take precedence.
 *
 * @param projectConfig - Values from the project config file
 * @param cliOptions - Values explicitly passed on the command line
 * @param cliDefaults - Commander's default values (to detect which flags the user actually set)
 * @returns Merged options object
 */
export function mergeWithCliOptions(
  projectConfig: ProjectConfig,
  cliOptions: Record<string, unknown>,
  cliDefaults: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...cliOptions };

  // Map project config keys (kebab-case) to CLI option keys (camelCase)
  const keyMap: Record<string, string> = {
    output: 'output',
    seed: 'seed',
    flat: 'flat',
    status: 'status',
    'no-security': 'security', // inverted boolean
    port: 'port',
    jar: 'jar',
    empty: 'empty',
    verbose: 'verbose',
    quiet: 'quiet',
    serve: 'serve',
    'dry-run': 'dryRun',
    templated: 'templated',
  };

  for (const [configKey, cliKey] of Object.entries(keyMap)) {
    const configValue = (projectConfig as Record<string, unknown>)[configKey];
    if (configValue === undefined) continue;

    // Only apply project config if the CLI option was NOT explicitly set by the user.
    // An option was explicitly set if its value differs from Commander's default.
    const cliValue = cliOptions[cliKey];
    const defaultValue = cliDefaults[cliKey];

    if (cliValue === defaultValue) {
      // CLI was not explicitly set — use project config value
      if (configKey === 'no-security') {
        // `no-security: true` in config → `security: false` in CLI
        merged['security'] = !configValue;
      } else if (configKey === 'seed' || configKey === 'port') {
        // Store as string to match CLI convention (parsed later)
        merged[cliKey] = String(configValue);
      } else {
        merged[cliKey] = configValue;
      }
    }
  }

  return merged;
}
