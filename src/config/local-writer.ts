/**
 * @file Local project config writer
 * @description Reads and writes individual keys to .stwrc.yaml in the current directory.
 *              Creates the file if it doesn't exist.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const CONFIG_FILE = '.stwrc.yaml';

/**
 * Get the path to the local config file in cwd.
 */
function getLocalConfigPath(): string {
  return join(process.cwd(), CONFIG_FILE);
}

/**
 * Read the existing local config, or return empty object.
 */
function readLocalConfig(): Record<string, unknown> {
  const filePath = getLocalConfigPath();
  if (!existsSync(filePath)) return {};

  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = yaml.load(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Write the config object back to .stwrc.yaml.
 */
function writeLocalConfigFile(config: Record<string, unknown>): void {
  const filePath = getLocalConfigPath();
  const content = yaml.dump(config, { indent: 2, lineWidth: -1 });
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Coerce a string value to the appropriate type for YAML.
 */
function coerceValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;
  return value;
}

/**
 * Set a key in the local .stwrc.yaml config.
 * Creates the file if it doesn't exist.
 *
 * @param key - Config key to set
 * @param value - String value (coerced to boolean/number as appropriate)
 */
export function writeLocalConfig(key: string, value: string): void {
  if (!key) throw new Error('Key cannot be empty.');
  if (value === undefined || value === '') throw new Error(`Value for "${key}" cannot be empty.`);

  const config = readLocalConfig();
  config[key] = coerceValue(value);
  writeLocalConfigFile(config);
}

/**
 * Remove a key from the local .stwrc.yaml config.
 *
 * @param key - Config key to remove
 */
export function unsetLocalConfig(key: string): void {
  if (!key) throw new Error('Key cannot be empty.');

  const filePath = getLocalConfigPath();
  if (!existsSync(filePath)) {
    throw new Error(`No local config file found (${CONFIG_FILE}).`);
  }

  const config = readLocalConfig();
  if (!(key in config)) {
    throw new Error(`Key "${key}" not found in ${CONFIG_FILE}.`);
  }

  delete config[key];
  writeLocalConfigFile(config);
}
