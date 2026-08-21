/**
 * @file Global configuration manager
 * @description Reads and writes user-level configuration stored in the stw home directory.
 *   Home directory resolution: STW_HOME env var > ~/.swagger-to-wiremock
 *   This provides persistent settings (like JAR path) so users don't need to pass flags every time.
 *
 * Supported keys:
 *   - port-range-min: Minimum allowed port for WireMock server
 *   - port-range-max: Maximum allowed port for WireMock server
 *   - jar: Path to WireMock standalone JAR
 *   - port: Default port for WireMock server
 *   - auto-port: Automatically find next available port when requested port is busy
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

/** Known configuration keys and their expected types */
export type ConfigKey = 'jar' | 'port' | 'output-dir' | 'foreground' | 'log-dir' | 'no-logs' | 'port-range-min' | 'port-range-max' | 'auto-port';

/** Configuration object shape */
export interface GlobalConfig {
  jar?: string;
  port?: number;
  'port-range-min'?: number;
  'port-range-max'?: number;
  'output-dir'?: string;
  'log-dir'?: string;
  'no-logs'?: boolean;
  'auto-port'?: boolean;
  foreground?: boolean;
  logrotate?: boolean;
}

/** All valid config keys */
const VALID_KEYS: ConfigKey[] = ['jar', 'port', 'output-dir', 'foreground', 'log-dir', 'no-logs', 'port-range-min', 'port-range-max', 'auto-port'];

/**
 * Resolve a path to absolute. If already absolute, returns as-is.
 * If relative, resolves against cwd.
 */
export function resolveToAbsolute(p: string): string {
  return resolve(p);
}

/**
 * Get the stw home directory.
 * Resolution: STW_HOME env var > ~/.swagger-to-wiremock
 */
export function getHome(): string {
  return process.env['STW_HOME'] ?? join(homedir(), '.swagger-to-wiremock');
}

/**
 * Get the path to the global config directory (same as home).
 */
export function getConfigDir(): string {
  return getHome();
}

/**
 * Get the path to the global config file (<home>/config.json)
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Get the default log directory (<home>/logs/)
 */
export function getDefaultLogDir(): string {
  return join(getHome(), 'logs');
}

/**
 * Check if a key is a valid config key.
 */
export function isValidKey(key: string): key is ConfigKey {
  return VALID_KEYS.includes(key as ConfigKey);
}

/**
 * Read the global configuration file.
 * Returns an empty object if the file doesn't exist or is malformed.
 */
export function readConfig(): GlobalConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return parsed as GlobalConfig;
  } catch {
    return {};
  }
}

/**
 * Write a value to the global configuration.
 * Creates the config directory and file if they don't exist.
 *
 * @param key - Configuration key
 * @param value - Value to store
 */
export function setConfig(key: ConfigKey, value: string): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const config = readConfig();

  // Type coercion for known keys
  if (key === 'port') {
    const numValue = parseInt(value, 10);
    if (Number.isNaN(numValue) || numValue < 1 || numValue > 65535) {
      throw new Error(`Invalid port value: ${value}. Must be a number between 1 and 65535.`);
    }
    config.port = numValue;
  } else if (key === 'port-range-min') {
    const numValue = parseInt(value, 10);
    if (Number.isNaN(numValue) || numValue < 1 || numValue > 65535) {
      throw new Error(`Invalid port-range-min value: ${value}. Must be a number between 1 and 65535.`);
    }
    // Validate min <= max if max is already set
    const currentMax = config['port-range-max'];
    if (currentMax !== undefined && numValue > currentMax) {
      throw new Error(`Invalid port-range-min: ${numValue} is greater than current port-range-max (${currentMax}).`);
    }
    config['port-range-min'] = numValue;
  } else if (key === 'port-range-max') {
    const numValue = parseInt(value, 10);
    if (Number.isNaN(numValue) || numValue < 1 || numValue > 65535) {
      throw new Error(`Invalid port-range-max value: ${value}. Must be a number between 1 and 65535.`);
    }
    // Validate max >= min if min is already set
    const currentMin = config['port-range-min'];
    if (currentMin !== undefined && numValue < currentMin) {
      throw new Error(`Invalid port-range-max: ${numValue} is less than current port-range-min (${currentMin}).`);
    }
    config['port-range-max'] = numValue;
  } else if (key === 'jar') {
    if (!value) {
      throw new Error('Invalid jar: path cannot be empty.');
    }
    if (!value.endsWith('.jar')) {
      throw new Error(`Invalid jar path: "${value}". Must be a .jar file.`);
    }
    const resolvedJar = resolveToAbsolute(value);
    if (!existsSync(resolvedJar)) {
      throw new Error(`JAR file not found: "${resolvedJar}". Check the path and try again.`);
    }
    config.jar = resolvedJar;
  } else if (key === 'output-dir') {
    if (!value) {
      throw new Error('Invalid output-dir: path cannot be empty.');
    }
    config['output-dir'] = resolveToAbsolute(value);
  } else if (key === 'log-dir') {
    if (!value) {
      throw new Error('Invalid log-dir: path cannot be empty.');
    }
    config['log-dir'] = resolveToAbsolute(value);
  } else if (key === 'foreground') {
    const lower = value.toLowerCase();
    if (lower !== 'true' && lower !== 'false') {
      throw new Error('Invalid foreground value: must be "true" or "false".');
    }
    config.foreground = lower === 'true';
  } else if (key === 'no-logs') {
    const lower = value.toLowerCase();
    if (lower !== 'true' && lower !== 'false') {
      throw new Error('Invalid no-logs value: must be "true" or "false".');
    }
    config['no-logs'] = lower === 'true';
  } else if (key === 'auto-port') {
    const lower = value.toLowerCase();
    if (lower !== 'true' && lower !== 'false') {
      throw new Error('Invalid auto-port value: must be "true" or "false".');
    }
    config['auto-port'] = lower === 'true';
  } else {
    (config as Record<string, unknown>)[key] = value;
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * Get a single config value.
 *
 * @param key - Configuration key
 * @returns The value, or undefined if not set
 */
export function getConfig(key: ConfigKey): string | number | boolean | undefined {
  const config = readConfig();
  return config[key];
}

/**
 * Remove a key from the global configuration.
 *
 * @param key - Configuration key to remove
 */
export function unsetConfig(key: ConfigKey): void {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) return;

  const config = readConfig();
  delete (config as Record<string, unknown>)[key];

  // If config is empty, remove the file
  if (Object.keys(config).length === 0) {
    try {
      unlinkSync(configPath);
    } catch {
      // Ignore — file may already be gone
    }
    return;
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * List all current config values.
 * @returns Object with all set config key-value pairs
 */
export function listConfig(): GlobalConfig {
  return readConfig();
}

/**
 * Get all valid config key names.
 */
export function getValidKeys(): readonly ConfigKey[] {
  return VALID_KEYS;
}

export { loadProjectConfig, mergeWithCliOptions } from './project-config.js';
