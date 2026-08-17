/**
 * @file Global configuration manager
 * @description Reads and writes user-level configuration stored at ~/.swagger-to-wiremock/config.json.
 *   This provides persistent settings (like JAR path) so users don't need to pass flags every time.
 *
 * Supported keys:
 *   - jar: Path to WireMock standalone JAR
 *   - port: Default port for WireMock server
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';

/** Known configuration keys and their expected types */
export type ConfigKey = 'jar' | 'port' | 'output-dir';

/** Configuration object shape */
export interface GlobalConfig {
  jar?: string;
  port?: number;
  'output-dir'?: string;
}

/** All valid config keys */
const VALID_KEYS: ConfigKey[] = ['jar', 'port', 'output-dir'];

/**
 * Get the path to the global config directory (~/.swagger-to-wiremock/)
 */
export function getConfigDir(): string {
  return join(homedir(), '.swagger-to-wiremock');
}

/**
 * Get the path to the global config file (~/.swagger-to-wiremock/config.json)
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
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
  } else if (key === 'jar') {
    if (!isAbsolute(value)) {
      throw new Error(`Invalid jar path: "${value}". Global config requires an absolute path (e.g. /path/to/wiremock.jar or C:\\path\\to\\wiremock.jar).`);
    }
    config.jar = value;
  } else if (key === 'output-dir') {
    if (!value) {
      throw new Error('Invalid output-dir: path cannot be empty.');
    }
    // Accept both relative and absolute paths — resolve at usage time
    config['output-dir'] = value;
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
export function getConfig(key: ConfigKey): string | number | undefined {
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
