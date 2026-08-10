/**
 * @file JAR path resolver
 * @description Resolves the WireMock standalone JAR location using a priority chain:
 *   1. Explicit --jar flag
 *   2. WIREMOCK_JAR environment variable
 *   3. Auto-detect in common locations relative to cwd
 */

import { accessSync, constants, readdirSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { ServerError } from '../errors/server-error.js';
import type { JarResolverOptions } from './types.js';

/** Glob-like pattern directories to search for a WireMock JAR */
const SEARCH_DIRS = ['.', './wiremock', '../wiremock', './lib', '../lib'];

/** Filename pattern: wiremock-standalone-*.jar or wiremock-*.jar */
const JAR_PATTERN = /^wiremock(?:-standalone)?[-.][\d.]+\.jar$/i;

/**
 * Check if a file exists and is readable.
 */
function fileExists(filePath: string): boolean {
  try {
    accessSync(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Search a directory for a WireMock JAR file matching the naming pattern.
 * Returns the first match, preferring "standalone" over plain.
 */
function findJarInDir(dir: string): string | undefined {
  try {
    const entries = readdirSync(dir);
    const jars = entries
      .filter((entry) => JAR_PATTERN.test(entry))
      .sort((a, b) => {
        // Prefer "standalone" variant
        const aStandalone = a.includes('standalone') ? 0 : 1;
        const bStandalone = b.includes('standalone') ? 0 : 1;
        return aStandalone - bStandalone;
      });
    return jars[0] ? join(dir, jars[0]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the WireMock JAR path using the priority chain:
 *   1. Explicit path (--jar flag)
 *   2. WIREMOCK_JAR environment variable
 *   3. Auto-detect in cwd and common relative directories
 *
 * @throws {ServerError} JAR_NOT_FOUND if no JAR can be located
 */
export function resolveJarPath(options: JarResolverOptions = {}): string {
  const { explicitPath, cwd = process.cwd(), verbose = false } = options;

  // Priority 1: Explicit --jar flag
  if (explicitPath) {
    const resolved = isAbsolute(explicitPath) ? explicitPath : resolve(cwd, explicitPath);
    if (verbose) console.log(`[server] Checking explicit JAR path: ${resolved}`);
    if (!fileExists(resolved)) {
      throw new ServerError('JAR_NOT_FOUND', `WireMock JAR not found at specified path: ${resolved}`, {
        path: resolved,
        source: '--jar flag',
      });
    }
    return resolved;
  }

  // Priority 2: WIREMOCK_JAR environment variable
  const envJar = process.env['WIREMOCK_JAR'];
  if (envJar) {
    const resolved = isAbsolute(envJar) ? envJar : resolve(cwd, envJar);
    if (verbose) console.log(`[server] Checking WIREMOCK_JAR env: ${resolved}`);
    if (!fileExists(resolved)) {
      throw new ServerError(
        'JAR_NOT_FOUND',
        `WireMock JAR not found at WIREMOCK_JAR path: ${resolved}`,
        { path: resolved, source: 'WIREMOCK_JAR env' },
      );
    }
    return resolved;
  }

  // Priority 3: Auto-detect in common locations
  if (verbose) console.log(`[server] Searching for WireMock JAR in common locations...`);
  for (const searchDir of SEARCH_DIRS) {
    const dir = resolve(cwd, searchDir);
    const found = findJarInDir(dir);
    if (found) {
      if (verbose) console.log(`[server] Found JAR: ${found}`);
      return found;
    }
  }

  throw new ServerError(
    'JAR_NOT_FOUND',
    'WireMock JAR not found. Provide a path with --jar, set WIREMOCK_JAR env variable, ' +
      'or place the JAR in ./wiremock/ or ./lib/.\n' +
      'Download: https://wiremock.org/docs/download-and-installation/',
    { searchedDirs: SEARCH_DIRS.map((d) => resolve(cwd, d)) },
  );
}
