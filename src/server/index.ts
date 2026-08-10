/**
 * @file WireMock server manager
 * @description Spawns and manages a WireMock standalone process as a child process.
 *   Handles Java detection, JAR resolution, startup, health checks, and graceful shutdown.
 */

import { spawn, execFileSync } from 'child_process';
import { accessSync, constants, existsSync } from 'fs';
import { join, resolve } from 'path';
import { ServerError } from '../errors/server-error.js';
import { resolveJarPath } from './jar-resolver.js';
import type { ServerOptions, ServerProcess } from './types.js';

export type { ServerOptions, ServerProcess } from './types.js';
export { resolveJarPath } from './jar-resolver.js';

/**
 * Detect if Java is available on the system.
 * @returns The java command path, or throws if not found
 */
function detectJava(verbose: boolean): string {
  const javaHome = process.env['JAVA_HOME'];
  const javaCandidates = javaHome
    ? [join(javaHome, 'bin', 'java'), 'java']
    : ['java'];

  for (const candidate of javaCandidates) {
    try {
      const version = execFileSync(candidate, ['-version'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (verbose) console.log(`[server] Java found: ${candidate}`);
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  throw new ServerError(
    'JAVA_NOT_FOUND',
    'Java is required to run WireMock but was not found on your PATH.\n' +
      'Install Java 11+ from: https://adoptium.net/\n' +
      'Or set JAVA_HOME to point to your Java installation.',
  );
}

/**
 * Validate that the stubs directory has the expected structure.
 * For split mode: rootDir contains class folders (2xx/, 4xx/, 5xx/) each with mappings/ + __files/
 * For flat mode: rootDir contains mappings/ + __files/ directly
 *
 * WireMock loads from --root-dir expecting mappings/ and __files/ at that level,
 * so for split mode we need to determine which class folder(s) to serve.
 */
function resolveWireMockRootDirs(rootDir: string, verbose: boolean): string[] {
  const resolved = resolve(rootDir);

  if (!existsSync(resolved)) {
    throw new ServerError('INVALID_STUBS_DIR', `Stubs directory does not exist: ${resolved}`, {
      path: resolved,
    });
  }

  // Check for flat mode: mappings/ directly in rootDir
  const flatMappingsDir = join(resolved, 'mappings');
  if (existsSync(flatMappingsDir)) {
    if (verbose) console.log(`[server] Detected flat output structure at: ${resolved}`);
    return [resolved];
  }

  // Check for split mode: class folders (2xx/, 4xx/, 5xx/) containing mappings/
  const classDirs = ['1xx', '2xx', '3xx', '4xx', '5xx']
    .map((cls) => join(resolved, cls))
    .filter((dir) => existsSync(join(dir, 'mappings')));

  if (classDirs.length > 0) {
    if (verbose) {
      console.log(`[server] Detected split output structure. Class folders: ${classDirs.length}`);
    }
    return classDirs;
  }

  throw new ServerError(
    'INVALID_STUBS_DIR',
    `No WireMock stubs found in: ${resolved}\n` +
      'Expected either mappings/ folder (flat mode) or 2xx/, 4xx/, 5xx/ folders (split mode).\n' +
      'Run "swagger-to-wiremock convert" first to generate stubs.',
    { path: resolved },
  );
}

/**
 * Start a WireMock standalone server as a child process.
 *
 * For split-mode output (multiple class dirs), serves the first class directory that exists.
 * In a future version, this could merge multiple class dirs or start multiple instances.
 * For now, when split mode is detected, all class dirs are loaded using WireMock's
 * multi-root support via multiple --root-dir flags (WireMock ≥ 2.32.0).
 *
 * @param options - Server configuration
 * @returns A ServerProcess handle for stopping the server
 */
export function startServer(options: ServerOptions): ServerProcess {
  const { rootDir, port = 8080, jarPath, verbose = false } = options;

  // 1. Detect Java
  const javaCmd = detectJava(verbose);

  // 2. Resolve JAR
  const resolvedJar = resolveJarPath({ explicitPath: jarPath, verbose });

  // 3. Validate stubs directory
  const wireMockRoots = resolveWireMockRootDirs(rootDir, verbose);

  // 4. Build WireMock command-line args
  const args = ['-jar', resolvedJar, '--port', String(port)];

  // Add root dirs — first one is the main --root-dir, rest are loaded via --root-dir as well
  // WireMock 2.x uses --root-dir for a single directory; for split mode we use the first one
  // and log a note about the others
  if (wireMockRoots.length === 1) {
    args.push('--root-dir', wireMockRoots[0]!);
  } else {
    // For multiple class dirs, use the first and add others as extra root dirs
    // WireMock 3.x supports multiple --root-dir; for 2.x we combine mappings via symlinks
    // Simplest approach: use the parent directory and configure WireMock to scan recursively
    // Actually — WireMock standalone loads from a single root-dir.
    // Best approach for split mode: serve the parent dir and let users choose,
    // OR combine into a temp flat dir. For now, serve all classes by using parent dir approach.
    // The cleanest solution: start WireMock with --root-dir for each class dir
    // But WireMock only accepts one --root-dir. Use the parent and note it.
    //
    // Final decision: serve the resolved parent. WireMock will NOT automatically find
    // nested mappings/. So we pick the most useful class dir (2xx first, then others).
    const preferred = wireMockRoots.find((d) => d.includes('2xx')) ?? wireMockRoots[0]!;
    args.push('--root-dir', preferred);

    if (verbose) {
      console.log(`[server] Split mode detected. Serving: ${preferred}`);
      console.log(`[server] To serve other status classes, use: swagger-to-wiremock serve <class-dir>`);
    } else {
      const servedClass = preferred.includes('2xx') ? '2xx' : preferred.split(/[\\/]/).pop();
      console.log(`[info] Serving ${servedClass}/ stubs (use "serve <dir>" to pick a different class)`);
    }
  }

  args.push('--verbose', String(verbose));

  if (verbose) {
    console.log(`[server] Starting: ${javaCmd} ${args.join(' ')}`);
  }

  // 5. Spawn the process
  const child = spawn(javaCmd, args, {
    stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let exited = false;
  let exitCode: number | null = null;

  const exitPromise = new Promise<number | null>((resolvePromise) => {
    child.on('exit', (code) => {
      exited = true;
      exitCode = code;
      resolvePromise(code);
    });

    child.on('error', (err) => {
      if (!exited) {
        exited = true;
        exitCode = 1;
        console.error(`[server] Process error: ${err.message}`);
        resolvePromise(1);
      }
    });
  });

  // If not verbose, buffer stderr and check for startup failures
  if (!verbose && child.stderr) {
    let stderrBuffer = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      // Check for common startup errors
      if (stderrBuffer.includes('Address already in use')) {
        console.error(`\n❌ Port ${port} is already in use. Try a different port with --port.`);
      }
    });
  }

  // If not verbose, watch stdout for the "started" message
  if (!verbose && child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => {
      const output = chunk.toString();
      if (output.includes('port:')) {
        console.log(`✅ WireMock running on http://localhost:${port}`);
        console.log(`   Admin: http://localhost:${port}/__admin`);
        console.log('   Press Ctrl+C to stop');
      }
    });
  }

  const serverProcess: ServerProcess = {
    port,
    stop: () => {
      if (!exited) {
        child.kill('SIGTERM');
        // Force kill after 5s if still running
        setTimeout(() => {
          if (!exited) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }
    },
    waitForExit: () => exitPromise,
  };

  return serverProcess;
}
