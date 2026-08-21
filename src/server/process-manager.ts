/**
 * @file Background process manager
 * @description Manages background WireMock server processes — spawning detached,
 *   tracking PIDs in a registry file, health checking, and stopping servers.
 *
 * Registry file: ~/.swagger-to-wiremock/servers.json  
 */

import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import type { ServerRegistryEntry } from './types.js';

const CONFIG_DIR = join(homedir(), '.swagger-to-wiremock');
const REGISTRY_FILE = join(CONFIG_DIR, 'servers.json');

// ─── Registry I/O ────────────────────────────────────────────────────────────

/**
 * Read the server registry file.
 * Returns an empty array if the file doesn't exist or is malformed.
 */
export function readRegistry(): ServerRegistryEntry[] {
  if (!existsSync(REGISTRY_FILE)) {
    return [];
  }

  try {
    const content = readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) return [];
    return parsed as ServerRegistryEntry[];
  } catch {
    return [];
  }
}

/**
 * Write the server registry to disk.
 * Creates the config directory if it doesn't exist.
 */
export function writeRegistry(entries: ServerRegistryEntry[]): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  writeFileSync(REGISTRY_FILE, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

// ─── Process utilities ───────────────────────────────────────────────────────

/**
 * Check if a process with the given PID is still alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 checks existence without killing
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process by PID. Uses SIGTERM first, then force-kills after timeout.
 * On Windows, uses taskkill.
 */
export function killProcess(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
      // Give it 3 seconds, then SIGKILL
      setTimeout(() => {
        try {
          if (isProcessAlive(pid)) {
            process.kill(pid, 'SIGKILL');
          }
        } catch {
          // Already dead
        }
      }, 3000);
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Register a new server entry in the registry.
 */
export function registerServer(entry: ServerRegistryEntry): void {
  const entries = readRegistry();

  // Remove any stale entry on the same port
  const filtered = entries.filter((e) => e.port !== entry.port);
  filtered.push(entry);

  writeRegistry(filtered);
}

/**
 * Remove a server entry by port from the registry.
 */
export function unregisterServer(port: number): void {
  const entries = readRegistry();
  const filtered = entries.filter((e) => e.port !== port);
  writeRegistry(filtered);
}

/**
 * Get status of all registered servers, marking dead ones.
 * Automatically removes dead entries from the registry.
 */
export function getServerStatus(): (ServerRegistryEntry & { alive: boolean })[] {
  const entries = readRegistry();
  const results = entries.map((entry) => ({
    ...entry,
    alive: isProcessAlive(entry.pid),
  }));

  // Clean up dead entries from registry
  const aliveEntries = results.filter((e) => e.alive);
  if (aliveEntries.length !== entries.length) {
    writeRegistry(aliveEntries.map(({ alive, ...rest }) => rest));
  }

  return results;
}

/**
 * Find a registered server by port.
 */
export function findServerByPort(port: number): ServerRegistryEntry | undefined {
  const entries = readRegistry();
  return entries.find((e) => e.port === port);
}

/**
 * Check if a port is occupied by a registered (and alive) server.
 */
export function isPortOccupied(port: number): { occupied: boolean; entry?: ServerRegistryEntry } {
  const entry = findServerByPort(port);
  if (!entry) return { occupied: false };

  if (isProcessAlive(entry.pid)) {
    return { occupied: true, entry };
  }

  // Stale entry — clean it up
  unregisterServer(port);
  return { occupied: false };
}

/**
 * Stop a server by port.
 * @returns true if stopped successfully, false if not found or already dead
 */
export function stopServer(port: number): { success: boolean; entry?: ServerRegistryEntry } {
  const entry = findServerByPort(port);
  if (!entry) {
    return { success: false };
  }

  if (!isProcessAlive(entry.pid)) {
    unregisterServer(port);
    return { success: false, entry };
  }

  const killed = killProcess(entry.pid);
  if (killed) {
    unregisterServer(port);
  }

  return { success: killed, entry };
}

/**
 * Stop all registered servers.
 * @returns Number of servers stopped
 */
export function stopAllServers(): number {
  const entries = readRegistry();
  let stopped = 0;

  for (const entry of entries) {
    if (isProcessAlive(entry.pid)) {
      if (killProcess(entry.pid)) {
        stopped++;
      }
    }
  }

  // Clear the registry
  writeRegistry([]);
  return stopped;
}

/**
 * Spawn WireMock as a detached background process and register it.
 *
 * @param javaCmd - Path to java executable
 * @param args - Arguments for java (includes -jar, JAR path, --port, --root-dir)
 * @param meta - Metadata to store in the registry (port, rootDir)
 * @returns The PID of the spawned process
 */
/**
 * Spawn a background WireMock process with output redirected to a log file.
 *
 * @param javaCmd - Path to java executable
 * @param args - JVM + WireMock arguments
 * @param meta - Metadata for registry (port, rootDir, logFile)
 * @returns The spawned process PID
 */
export function spawnBackground(
  javaCmd: string,
  args: string[],
  meta: { port: number; rootDir: string; logFile?: string },
): number {
  let stdio: ('ignore' | number)[];

  if (meta.logFile) {
    // Open log file for append and redirect stdout + stderr to it
    const logFd = openSync(meta.logFile, 'a');
    stdio = ['ignore', logFd, logFd];
  } else {
    stdio = ['ignore', 'ignore', 'ignore'];
  }

  const child = spawn(javaCmd, args, {
    detached: true,
    stdio,
  });

  // Unref so the parent can exit without waiting for the child
  child.unref();

  const pid = child.pid;
  if (!pid) {
    throw new Error('Failed to spawn background process — no PID returned');
  }

  // Register in the server registry
  registerServer({
    port: meta.port,
    pid,
    rootDir: meta.rootDir,
    startedAt: new Date().toISOString(),
    ...(meta.logFile ? { logFile: meta.logFile } : {}),
  });

  return pid;
}

/**
 * Resolve the path to the log-forwarder script (bundled alongside cli.js).
 */
function resolveForwarderPath(): string {
  // In ESM, use import.meta.url to find sibling files in dist/
  const thisFile = fileURLToPath(import.meta.url);
  const distDir = join(thisFile, '..');
  // tsup builds log-forwarder.js as a separate entry point
  const forwarderPath = join(distDir, 'log-forwarder.js');
  if (!existsSync(forwarderPath)) {
    throw new Error(`Log forwarder not found at: ${forwarderPath}. Rebuild with: npm run build`);
  }
  return forwarderPath;
}

/**
 * Spawn a background WireMock process via the log-forwarder Node wrapper.
 * The forwarder handles SIGHUP (logrotate) and pipes output through a logger.
 * The PID registered in servers.json is the forwarder's — not WireMock's.
 *
 * @param javaCmd - Path to java executable
 * @param wmArgs - WireMock arguments (everything after `java`)
 * @param meta - Metadata for registry (port, rootDir, logFile)
 * @returns The forwarder process PID
 */
export function spawnWithForwarder(
  javaCmd: string,
  wmArgs: string[],
  meta: { port: number; rootDir: string; logFile: string },
): number {
  const forwarderPath = resolveForwarderPath();

  // Args: <javaCmd> <logFile> <port> <rootDir> -- <wiremock args...>
  const forwarderArgs = [
    forwarderPath,
    javaCmd, meta.logFile, String(meta.port), meta.rootDir,
    '--',
    ...wmArgs,
  ];

  const child = spawn('node', forwarderArgs, {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  child.unref();

  const pid = child.pid;
  if (!pid) {
    throw new Error('Failed to spawn log-forwarder process — no PID returned');
  }

  registerServer({
    port: meta.port,
    pid,
    rootDir: meta.rootDir,
    startedAt: new Date().toISOString(),
    logFile: meta.logFile,
  });

  return pid;
}
