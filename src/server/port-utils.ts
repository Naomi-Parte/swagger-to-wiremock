/**
 * @file Port utilities
 * @description Validates ports against a globally-configured range.
 *   Prevents port-hoarding in shared test environments by enforcing
 *   a valid port window set via `stw config set port-range-min / port-range-max`.
 */

import { readConfig } from '../config/index.js';

export interface PortRange {
  min: number;
  max: number;
}

/**
 * Read the configured port range from global config.
 * Falls back to 1–65535 when not configured.
 */
export function getPortRange(): PortRange {
  const config = readConfig();
  const min = config['port-range-min'] ?? 1;
  const max = config['port-range-max'] ?? 65535;
  return { min, max };
}

/**
 * Validate that a port falls within the configured global port range.
 * Throws a descriptive error if the port is outside the range.
 *
 * @param port - The port number to validate
 * @throws Error if port is outside the configured range
 */
export function validatePortRange(port: number): void {
  const config = readConfig();
  const min = config['port-range-min'];
  const max = config['port-range-max'];

  // If neither bound is configured, no range enforcement
  if (min === undefined && max === undefined) return;

  const effectiveMin = min ?? 1;
  const effectiveMax = max ?? 65535;

  if (port < effectiveMin || port > effectiveMax) {
    throw new Error(
      `Port ${port} is outside the allowed range (${effectiveMin}–${effectiveMax}).\n` +
      `   Update the range with: stw config set port-range-min / port-range-max`,
    );
  }
}
