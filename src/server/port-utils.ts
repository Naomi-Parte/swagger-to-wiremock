/**
 * @file Port utilities
 * @description Port validation, availability checking, and auto-increment logic.
 *   Prevents port-hoarding in shared test environments by enforcing
 *   a valid port window set via `stw config set port-range-min / port-range-max`.
 *   Provides TCP-level port availability probing and automatic fallback to the
 *   next available port when the requested port is busy.
 */

import { createServer, createConnection } from 'net';
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
      `Port ${port} is outside the allowed range (${effectiveMin}–${effectiveMax}).`,
    );
  }
}

/**
 * Check if a port is available by attempting to bind a TCP server to it.
 * Uses a dual strategy:
 *   1. Try to connect to the port — if something accepts, the port is occupied.
 *   2. If connection is refused, try to bind — if bind fails, the port is occupied.
 * This reliably detects port conflicts on all platforms including Windows.
 *
 * @param port - Port number to check
 * @returns true if the port is free, false if occupied
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });

    // If we can connect, something is listening — port is taken
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });

    // If connection is refused, try to bind to confirm it's truly free
    socket.once('error', () => {
      socket.destroy();
      const server = createServer();
      server.once('error', () => {
        resolve(false);
      });
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '0.0.0.0');
    });

    // Timeout: if neither connect nor error fires in 1s, treat as unavailable
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export interface FindPortOptions {
  /** Maximum port number to try (default: port-range-max or 65535) */
  max?: number;
  /** Maximum number of ports to attempt (default: 20) */
  maxRetries?: number;
}

/**
 * Find an available port starting from `startPort`, incrementing until one is free.
 *
 * Respects the configured port range — will not go above the range max.
 * Returns the first available port, or throws if none found within limits.
 *
 * @param startPort - Port to try first
 * @param options - Optional max port and retry limits
 * @returns The first available port
 * @throws Error if no port is available within the range/retry limit
 */
export async function findAvailablePort(startPort: number, options: FindPortOptions = {}): Promise<number> {
  const range = getPortRange();
  const max = options.max ?? range.max;
  const maxRetries = options.maxRetries ?? 20;

  let attempts = 0;
  let candidate = startPort;

  while (candidate <= max && attempts < maxRetries) {
    const available = await isPortAvailable(candidate);
    if (available) {
      return candidate;
    }
    attempts++;
    candidate++;
  }

  // All attempts exhausted
  const rangeDesc = (range.min !== 1 || range.max !== 65535)
    ? ` in range ${range.min}–${range.max}`
    : '';
  throw new Error(
    `No available port found${rangeDesc} (tried ${attempts} ports starting from ${startPort}).`,
  );
}
