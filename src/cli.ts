#!/usr/bin/env node

/**
 * @file CLI entry point for swagger-to-wiremock
 * @description Parses command-line arguments and orchestrates the conversion pipeline
 */

import { program } from 'commander';
import { resolve, join, basename } from 'path';
import { existsSync, rmSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { tmpdir, homedir } from 'os';
import { execFileSync } from 'child_process';
import { parseOpenAPISpec } from './parser/index.js';
import { transformSpec } from './transformer/index.js';
import { generateMappings } from './generator/index.js';
import { writeStubs } from './writer/index.js';
import { ParserError } from './errors/parser-error.js';
import { ServerError } from './errors/server-error.js';
import { parseStatusFilter, filterByStatus } from './filters/status-filter.js';
import { synthesisePlaceholderRecords, extractSpecificCodes } from './filters/placeholder-generator.js';
import { startServer, resolveJarPath } from './server/index.js';
import { openLogFileForBackground, listLogFiles } from './server/logger.js';
import { spawnBackground, getServerStatus, stopServer, stopAllServers } from './server/process-manager.js';
import { setConfig, getConfig, unsetConfig, listConfig, isValidKey, getValidKeys } from './config/index.js';
import { loadProjectConfig, mergeWithCliOptions } from './config/project-config.js';
import { validatePortRange, findAvailablePort, isPortAvailable } from './server/port-utils.js';
import { initConfig } from './config/init.js';
import { createStubServerDir } from './server/stub-server.js';
import { writeLocalConfig, unsetLocalConfig } from './config/local-writer.js';

const version = '1.1.0';

const binName = (() => {
  const raw = basename(process.argv[1] || 'stw').replace(/\.(js|ts|mjs|cjs)$/, '');
  // If invoked via node (e.g. `node dist/cli.js`), fall back to 'stw'
  return raw === 'cli' ? 'stw' : raw;
})();

const EXAMPLES = `
Examples:
  $ ${binName} convert ./petstore.yaml
  $ ${binName} convert ./api.yaml -o ./wiremock-stubs
  $ ${binName} convert ./api.yaml -o ./stubs -s 99 -v
  $ ${binName} convert ./api.yaml --dry-run
  $ ${binName} convert ./api.yaml --no-clean -o ./existing-stubs
  $ ${binName} convert ./api.yaml --status 2xx        # Only success responses
  $ ${binName} convert ./api.yaml --status 4xx,5xx    # Only error responses
  $ ${binName} convert ./api.yaml --status 400,404    # Specific status codes
  $ ${binName} convert ./api.yaml --empty             # Skeleton with TODO bodies
  $ ${binName} convert ./api.yaml --flat              # Single mappings/__files folder (no split)
  $ ${binName} convert ./api.yaml --serve             # Generate + start mock server
  $ ${binName} convert ./api.yaml --no-security       # Skip auth header matchers
  $ ${binName} convert ./api.yaml --serve --port 9090 # Generate + serve on custom port
  $ ${binName} serve ./wiremock-stubs                 # Start server from existing stubs
  $ ${binName} serve ./wiremock-stubs --port 9090     # Serve on custom port
  $ ${binName} serve --stub 200                       # Catch-all 200 server (no spec needed)
  $ ${binName} serve --stub 503 --port 3000           # Simulate downstream outage
  $ ${binName} serve ./petstore.yaml                  # Convert spec + serve in one step
  $ ${binName} serve ./api.yaml --status 2xx --port 9090  # Convert (2xx only) + serve
  $ ${binName} config set jar /path/to/wiremock.jar   # Set JAR path globally
  $ ${binName} config set port 9090                   # Set default port
  $ ${binName} config get jar                         # Show configured JAR path
  $ ${binName} config unset jar                       # Remove JAR config
  $ ${binName} config list                            # Show all config
`;

interface ConvertOptions {
  output: string;
  seed?: string | false;
  outputDir?: string;
  verbose?: boolean;
  quiet?: boolean;
  clean?: boolean; // Commander handles --no-clean as clean=false
  dryRun?: boolean;
  helpExamples?: boolean;
  status?: string;
  empty?: boolean;
  flat?: boolean;
  serve?: boolean;
  security?: boolean;  // Commander handles --no-security as security=false
  port?: string;
  jar?: string;
  templated?: boolean;
}

interface ServeOptions {
  port?: string;
  jar?: string;
  autoPort?: boolean; // Commander handles --no-auto-port as autoPort=false
  stub?: string;
  status?: string;
  flat?: boolean;
  seed?: string | false;
  security?: boolean;
  foreground?: boolean;
  background?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  logs?: boolean;
}

/**
 * Format per-folder stub counts for the split-mode summary line.
 * @param folderCounts - Stub counts keyed by folder name (e.g. "2xx")
 * @returns Formatted string, e.g. "2xx/ (3 stubs), 5xx/ (3 stubs)"
 */
function formatFolderSummary(folderCounts: Record<string, number>): string {
  const classOrder = ['1xx', '2xx', '3xx', '4xx', '5xx'];
  const parts: string[] = [];

  for (const cls of classOrder) {
    if (folderCounts[cls] !== undefined) {
      parts.push(`${cls}/ (${folderCounts[cls]} stubs)`);
    }
  }

  return parts.join(', ');
}

/**
 * Format a caught error into a user-facing message, tailoring known error
 * codes to friendlier text.
 * @param error - Error thrown by the pipeline
 * @returns Human-readable message (without the leading ❌)
 */
function formatErrorMessage(error: unknown): string {
  if (error instanceof ParserError) {
    if (error.code === 'INVALID_FILE') {
      return error.message;
    }
    if (error.code === 'PARSE_ERROR' || error.code === 'INVALID_SPEC' || error.code === 'CIRCULAR_REF') {
      return `Failed to parse spec: ${error.message}`;
    }
  }

  if (error instanceof ServerError) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve a config value using the standard priority chain:
 *   CLI flag > local project config > global config > default
 *
 * @param cliValue - Value from CLI flag (undefined if not passed)
 * @param projectConfig - Loaded project config object
 * @param projectKey - Key name in project config (e.g. 'port', 'flat')
 * @param globalKey - Key name in global config (pass null to skip global lookup)
 * @param defaultValue - Fallback default
 * @returns Resolved value
 */
function resolveConfig<T>(
  cliValue: T | undefined,
  projectConfig: Record<string, unknown>,
  projectKey: string,
  globalKey: string | null,
  defaultValue: T,
): T {
  if (cliValue !== undefined) return cliValue;
  const projectValue = projectConfig[projectKey] as T | undefined;
  if (projectValue !== undefined) return projectValue;
  if (globalKey) {
    const globalValue = getConfig(globalKey as Parameters<typeof getConfig>[0]) as T | undefined;
    if (globalValue !== undefined) return globalValue;
  }
  return defaultValue;
}

/**
 * Convert a Windows path to POSIX-style for MINGW/Git Bash compatibility.
 * e.g. "C:\Users\nparte\wiremock" → "/c/Users/nparte/wiremock"
 * On non-Windows or paths already POSIX, returns as-is.
 */
function toPosixPath(p: string): string {
  if (/^[A-Z]:\\/i.test(p)) {
    return '/' + p[0]!.toLowerCase() + p.slice(2).replace(/\\/g, '/');
  }
  return p.replace(/\\/g, '/');
}

/**
 * Prompt the user for yes/no confirmation.
 * @param message - Question to display
 * @returns true if user answers y/yes
 */
function confirmPrompt(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((res) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

/**
 * Format a stubs directory path for display in `stw status`.
 * - Temp stw-stub-* → stub:<status>
 * - Temp stw-serve-* → serve:<spec-name>
 * - Path starts with home dir → ~/...
 * - Otherwise → full path
 */
function formatStubsDir(dir: string): string {
  const baseName = dir.replace(/^.*[\\/]/, '');

  // Temp stub dirs: stw-stub-<status>-<timestamp>
  const stubMatch = baseName.match(/^stw-stub-(\d+)-/);
  if (stubMatch) return `stub:${stubMatch[1]}`;

  // Temp serve dirs: stw-serve-<specname>-<timestamp>
  const serveMatch = baseName.match(/^stw-serve-(.+?)-\d+$/);
  if (serveMatch) return `serve:${serveMatch[1]}`;

  // Replace home dir with ~
  const home = homedir();
  if (dir.startsWith(home)) return '~' + dir.slice(home.length).replace(/\\/g, '/');

  return dir;
}

/**
 * Clean up a temp directory if it was created by stw.
 * Only removes directories in the OS temp folder that match the stw naming pattern.
 * @param dir - Directory path to check and potentially remove
 */
function cleanupTempStubDir(dir: string): void {
  const osTmp = tmpdir();
  const normalizedDir = resolve(dir);
  const normalizedTmp = resolve(osTmp);
  const baseName = normalizedDir.replace(/^.*[\\/]/, '');
  if (normalizedDir.startsWith(normalizedTmp) && (baseName.startsWith('stw-stub-') || baseName.startsWith('stw-serve-'))) {
    try { rmSync(normalizedDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * Register Ctrl+C handler for graceful server shutdown.
 */
function registerShutdownHandler(
  stopFn: () => void,
  quiet: boolean,
  cleanupDir?: string,
): void {
  const handler = (): void => {
    if (!quiet) console.log('\n[info] Shutting down WireMock...');
    stopFn();
    // Clean up temp directory if one was created
    if (cleanupDir) {
      cleanupTempStubDir(cleanupDir);
    }
    // Give it a moment to clean up, then exit
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}

program
  .name(binName)
  .description('Convert OpenAPI 3.0/3.1 specs to native WireMock JSON stub mappings')
  .version(version);

program
  .command('convert <input>')
  .description('Convert an OpenAPI spec to WireMock mappings')
  .option('-o, --output <dir>', 'Output directory (default: ./<spec-name>)', './wiremock')
  .option('-s, --seed <seed>', 'Seed for deterministic response generation (default: random)')
  .option('--no-seed', 'Disable seeded generation (random output each run)')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress all output except errors')
  .option('--dry-run', 'Show what would be generated without writing files')
  .option('--no-clean', 'Do not remove output directory before writing')
  .option('--help-examples', 'Show usage examples')
  .option('--status <codes>', 'Filter by status code: 2xx, 4xx, 5xx, or specific codes (comma-separated)')
  .option('--empty', 'Generate skeleton stubs with TODO placeholder response bodies')
  .option('--flat', 'Write a single mappings/__files folder instead of splitting by status class')
  .option('--serve', 'Start WireMock server after generating stubs')
  .option('--no-security', 'Skip security scheme matchers (generate stubs without auth requirements)')
  .option('--port <port>', 'Port for WireMock server (default: 8080, used with --serve)')
  .option('--jar <path>', 'Path to WireMock standalone JAR (used with --serve)')
  .option('--templated', 'Use WireMock response templating (Handlebars) to echo request data in responses')
  .action(async (input: string, options: ConvertOptions) => {
    if (options.helpExamples) {
      console.log(EXAMPLES);
      process.exit(0);
    }

    // ─── Load project config and merge ───────────────────────────────────
    const { config: projectConfig, source: projectConfigSource } = loadProjectConfig();

    const cliDefaults: Record<string, unknown> = {
      output: './wiremock',
      seed: undefined,
      verbose: undefined,
      quiet: undefined,
      clean: true,
      dryRun: undefined,
      status: undefined,
      empty: undefined,
      flat: undefined,
      serve: undefined,
      security: true,
      port: undefined,
      jar: undefined,
      templated: undefined,
      outputDir: undefined,
    };

    const merged = mergeWithCliOptions(projectConfig, options as unknown as Record<string, unknown>, cliDefaults) as unknown as ConvertOptions;

    const verbose = merged.quiet ? false : (merged.verbose ?? false);
    const quiet = merged.quiet ?? false;
    const log = (message: string): void => {
      if (verbose) console.log(message);
    };

    try {
      // Log project config source if found
      if (projectConfigSource) {
        log(`[info] Using config: ${projectConfigSource}`);
      }

      let seed: number | undefined = 42;
      if (merged.seed === false) {
        // --no-seed flag: disable deterministic generation
        seed = undefined;
      } else if (merged.seed !== undefined) {
        seed = parseInt(merged.seed as string, 10);
        if (Number.isNaN(seed)) {
          console.error('❌ Invalid seed value: must be a number');
          console.error('Run with -v for full stack trace');
          process.exit(1);
        }
      }

      // Derive output directory from spec filename if user didn't explicitly set -o
      if (merged.output === './wiremock') {
        const specBaseName = input.replace(/^.*[\\/]/, '').replace(/\.(yaml|yml|json)$/i, '');
        const sanitized = specBaseName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const specDirName = sanitized || 'wiremock';

        // Resolve output-dir: project config > global config > undefined
        const outputDir = resolveConfig<string | undefined>(
          merged.outputDir, projectConfig as Record<string, unknown>, 'output-dir', 'output-dir', undefined,
        );

        merged.output = outputDir ? join(outputDir, specDirName) : `./${specDirName}`;
      }

      log(`[info] Input: ${input}`);
      log(`[info] Output: ${merged.output}`);
      log(`[info] Seed: ${seed ?? 'random (no seed)'}`);

      // Step 1: Parse
      log('[info] Parsing spec...');
      const spec = await parseOpenAPISpec(input, { verbose, quiet });

      // Step 2: Transform
      log('[info] Transforming to IR...');
      const records = transformSpec(spec);
      log(`[info] ${records.length} operations found`);

      // Strip security matchers if --no-security
      if (merged.security === false) {
        log('[info] --no-security: skipping auth matchers');
        for (const record of records) {
          delete record.securityMatchers;
        }
      }

      // Step 2.5: Filter by status (if --status provided)
      let filteredRecords = records;
      let isPlaceholderMode = false;
      if (merged.status) {
        const filters = parseStatusFilter(String(merged.status));
        filteredRecords = filterByStatus(records, filters);
        log(`[info] Status filter: ${merged.status} → ${filteredRecords.length}/${records.length} records`);

        if (filteredRecords.length === 0) {
          const specificCodes = extractSpecificCodes(filters);

          if (specificCodes.length > 0) {
            log(
              `[info] Status ${options.status} not defined in spec — generating placeholders for all endpoints`,
            );
            filteredRecords = synthesisePlaceholderRecords(records, specificCodes);
            log(`[info] ${filteredRecords.length} placeholder mappings generated`);
            isPlaceholderMode = true;
          } else {
            console.warn(`⚠️ No operations match status filter "${merged.status}"`);
            process.exit(0);
          }
        }
      }

      // Step 3: Generate mappings
      log('[info] Generating mappings...');
      const mappings = generateMappings(filteredRecords, {
        seed,
        templated: merged.templated ?? false,
      });
      log(`[info] ${mappings.length} mappings generated`);

      // Step 4: Write to disk (skip if --dry-run + --serve, since there's nothing to serve)
      log('[info] Writing files...');
      const result = await writeStubs(mappings, filteredRecords, {
        outputDir: merged.output,
        clean: merged.clean ?? true,
        dryRun: merged.dryRun ?? false,
        seed,
        empty: merged.empty ?? false,
        flat: merged.flat ?? false,
      });

      // Summary
      if (!quiet) {
        console.log(`✅ Generated ${mappings.length} mappings → ${merged.output}`);
        if (result.folderCounts) {
          console.log(`   Folders: ${formatFolderSummary(result.folderCounts)}`);
        } else {
          console.log(`   ${result.bodyFiles.length} response body files`);
          console.log(`   ${(result.totalBytes / 1024).toFixed(1)} KB total`);
        }
        if (isPlaceholderMode) {
          console.log(`   ℹ️  Status ${merged.status} not defined in spec — placeholder mappings generated`);
        } else if (merged.empty) {
          console.log('   ℹ️  Empty templates — populate __files/*.json with your responses');
        }
      }

      // Step 5: Start server if --serve
      if (merged.serve) {
        if (merged.dryRun) {
          if (!quiet) console.log('[info] --dry-run: skipping server start (no files written)');
          process.exit(0);
        }

        const port = resolveConfig(
          merged.port ? parseInt(merged.port, 10) : undefined,
          projectConfig as Record<string, unknown>, 'port', 'port', 8080,
        );
        if (Number.isNaN(port) || port < 1 || port > 65535) {
          console.error('❌ Invalid port: must be a number between 1 and 65535');
          process.exit(1);
        }

        // Validate against global port range
        try {
          validatePortRange(port);
        } catch (rangeErr) {
          console.error(`❌ ${rangeErr instanceof Error ? rangeErr.message : String(rangeErr)}`);
          process.exit(1);
        }

        // Auto-increment port if unavailable (convert --serve always uses auto-port)
        let effectivePort = port;
        try {
          effectivePort = await findAvailablePort(port);
        } catch (portErr) {
          console.error(`❌ ${portErr instanceof Error ? portErr.message : String(portErr)}`);
          process.exit(1);
        }

        if (effectivePort !== port && !quiet) {
          console.log(`⚠️  Port ${port} unavailable — using ${effectivePort} instead.`);
        }

        if (!quiet) console.log(`\n[info] Starting WireMock on port ${effectivePort}...`);

        const server = startServer({
          rootDir: merged.output,
          port: effectivePort,
          jarPath: merged.jar,
          verbose,
        });

        registerShutdownHandler(server.stop, quiet);

        // Keep the process alive until WireMock exits
        const exitCode = await server.waitForExit();
        process.exit(exitCode ?? 0);
      }

      process.exit(0);
    } catch (error) {
      console.error(`❌ ${formatErrorMessage(error)}`);
      if (verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      } else {
        console.error('Run with -v for full stack trace');
      }
      process.exit(1);
    }
  });

program
  .command('serve [target]')
  .description('Start WireMock server from stubs directory, spec file, or catch-all stub (--stub)')
  .option('-p, --port <port>', 'Port for WireMock server (default: 8080)')
  .option('-f, --foreground', 'Keep server in foreground (block until Ctrl+C)')
  .option('-b, --background', 'Start server in background [default]')
  .option('--jar <path>', 'Path to WireMock standalone JAR')
  .option('--stub <status>', 'Start a catch-all server returning the given HTTP status code (e.g. --stub 200)')
  .option('--status <codes>', 'Filter by status code when serving a spec file (e.g. 2xx, 4xx)')
  .option('--flat', 'Use flat output when converting a spec file')
  .option('-s, --seed <seed>', 'Seed for deterministic response generation')
  .option('--no-seed', 'Disable seeded generation (random output each run)')
  .option('--no-security', 'Skip security scheme matchers when converting a spec file')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress all output except errors')
  .option('--no-logs', 'Disable session logging for this serve')
  .option('--no-auto-port', 'Disable automatic port increment when port is unavailable')
  .action(async (target: string | undefined, options: ServeOptions) => {
    const verbose = options.quiet ? false : (options.verbose ?? false);
    const quiet = options.quiet ?? false;

    try {
      // Resolve port: CLI flag > project config > global config > default (8080)
      const { config: serveProjectCfg } = loadProjectConfig();
      const port = resolveConfig(
        options.port ? parseInt(options.port, 10) : undefined,
        serveProjectCfg as Record<string, unknown>, 'port', 'port', 8080,
      );
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error('❌ Invalid port: must be a number between 1 and 65535');
        process.exit(1);
      }

      // Validate against global port range
      try {
        validatePortRange(port);
      } catch (rangeErr) {
        console.error(`❌ ${rangeErr instanceof Error ? rangeErr.message : String(rangeErr)}`);
        process.exit(1);
      }

      // Resolve auto-port: CLI --no-auto-port > project config > global config > default (true)
      const autoPort = options.autoPort === false ? false : resolveConfig<boolean>(
        undefined, serveProjectCfg as Record<string, unknown>, 'auto-port', 'auto-port', true,
      );

      // Determine the root directory to serve
      let dir: string;
      let isTempDir = false;

      if (options.stub) {
        // --stub mode: generate a catch-all stub in a temp dir
        const stubStatus = parseInt(options.stub, 10);
        if (Number.isNaN(stubStatus) || stubStatus < 100 || stubStatus > 599) {
          console.error('❌ Invalid --stub value: must be an HTTP status code (100-599)');
          process.exit(1);
        }
        dir = createStubServerDir(stubStatus);
        isTempDir = true;
        if (!quiet) console.log(`[info] Stub mode: catch-all → ${stubStatus}`);
      } else if (target) {
        // Detect if target is a spec file (.yaml, .yml, .json)
        const lowerTarget = target.toLowerCase();
        const isSpecFile = lowerTarget.endsWith('.yaml') || lowerTarget.endsWith('.yml') || lowerTarget.endsWith('.json');

        if (isSpecFile) {
          // Convert the spec to stubs first, then serve
          if (!quiet) console.log(`[info] Detected spec file: ${target}`);
          if (!quiet) console.log('[info] Converting spec → stubs...');

          const spec = await parseOpenAPISpec(target, { verbose, quiet });
          let records = transformSpec(spec);

          // Strip security matchers if --no-security
          const noSecurity = resolveConfig(
            options.security === false ? true : undefined,
            serveProjectCfg as Record<string, unknown>, 'no-security', null, false,
          );
          if (noSecurity) {
            for (const record of records) {
              delete record.securityMatchers;
            }
          }

          // Apply status filter if provided
          const cfgStatus = resolveConfig<string | undefined>(options.status, serveProjectCfg as Record<string, unknown>, 'status', null, undefined);
          if (cfgStatus) {
            const filters = parseStatusFilter(String(cfgStatus));
            records = filterByStatus(records, filters);
          }

          const seed = options.seed === false ? undefined : resolveConfig(options.seed ? parseInt(options.seed, 10) : undefined, serveProjectCfg as Record<string, unknown>, 'seed', null, 42);
          const flat = resolveConfig(options.flat, serveProjectCfg as Record<string, unknown>, 'flat', null, true);
          const mappings = generateMappings(records, { seed });

          // Write to a temp directory
          const specName = target.replace(/^.*[\\/]/, '').replace(/\.(yaml|yml|json)$/i, '');
          const outputDir = join(tmpdir(), `stw-serve-${specName}-${Date.now()}`);

          await writeStubs(mappings, records, {
            outputDir,
            clean: true,
            flat,
            seed,
            empty: false,
          });

          if (!quiet) console.log(`✅ Converted ${mappings.length} stubs → ${outputDir}`);
          dir = outputDir;
          isTempDir = true;
        } else {
          dir = target;
        }
      } else {
        // No target and no --stub: try default ./wiremock
        if (existsSync('./wiremock/mappings')) {
          dir = './wiremock';
        } else {
          console.error('❌ No target specified and no stubs found in ./wiremock/');
          console.error('Usage: stw serve <dir|spec> or stw serve --stub <status>');
          process.exit(1);
        }
      }

      if (!quiet) console.log(`[info] Starting WireMock from: ${dir}`);
      if (!quiet) console.log(`[info] Port: ${port}`);

      // Resolve log-dir: project config > global config > default (<rootDir>/logs)
      const logDir = resolveConfig<string | undefined>(
        undefined, serveProjectCfg as Record<string, unknown>, 'log-dir', 'log-dir', undefined,
      );

      // Resolve no-logs: CLI --no-logs > config > default (false = logging enabled)
      const noLogs = resolveConfig<boolean>(
        options.logs === false ? true : undefined,
        serveProjectCfg as Record<string, unknown>, 'no-logs', 'no-logs', false,
      );

      // Determine foreground vs background: -f wins > -b wins > config > default (background)
      const runForeground = options.foreground ? true
        : options.background ? false
        : resolveConfig<boolean>(
            undefined, serveProjectCfg as Record<string, unknown>, 'foreground', 'foreground', false,
          );

      if (runForeground) {
        // Foreground mode: always verbose, start and block until exit
        const fgVerbose = true;
        // Resolve available port (auto-increment or hard-fail)
        let effectivePort = port;
        if (autoPort) {
          try {
            effectivePort = await findAvailablePort(port);
          } catch (portErr) {
            console.error(`❌ ${portErr instanceof Error ? portErr.message : String(portErr)}`);
            process.exit(1);
          }
          if (effectivePort !== port && !quiet) {
            console.log(`⚠️  Port ${port} unavailable — using ${effectivePort} instead.`);
          }
        } else {
          const available = await isPortAvailable(port);
          if (!available) {
            console.error(`❌ Port ${port} is already in use.`);
            process.exit(1);
          }
        }

        const server = startServer({
          rootDir: dir,
          port: effectivePort,
          // CLI --jar > project config jar > (resolveJarPath handles global config internally)
          jarPath: options.jar ?? serveProjectCfg.jar,
          verbose: fgVerbose,
          logDir,
          noLogs,
        });

        registerShutdownHandler(server.stop, quiet, isTempDir ? dir : undefined);

        // Keep the process alive until WireMock exits
        const exitCode = await server.waitForExit();
        process.exit(exitCode ?? 0);
      }

      // Background mode (default): spawn detached and exit immediately
      {
        // Resolve available port (auto-increment or hard-fail)
        let effectivePort = port;
        if (autoPort) {
          try {
            effectivePort = await findAvailablePort(port);
          } catch (portErr) {
            console.error(`❌ ${portErr instanceof Error ? portErr.message : String(portErr)}`);
            process.exit(1);
          }
          if (effectivePort !== port && !quiet) {
            console.log(`⚠️  Port ${port} unavailable — using ${effectivePort} instead.`);
          }
        } else {
          const available = await isPortAvailable(port);
          if (!available) {
            console.error(`❌ Port ${port} is already in use.`);
            process.exit(1);
          }
        }

        // Resolve JAR path
        // CLI --jar > project config jar > (resolveJarPath handles global config + env + auto-detect)
        const resolvedJar = resolveJarPath({ explicitPath: options.jar ?? serveProjectCfg.jar, verbose });

        // Detect Java
        const javaHome = process.env['JAVA_HOME'];
        const javaCandidates = javaHome ? [join(javaHome, 'bin', 'java'), 'java'] : ['java'];
        const javaCmd = javaCandidates.find((cmd) => {
          try { execFileSync(cmd, ['-version'], { stdio: 'pipe' }); return true; } catch { return false; }
        });
        if (!javaCmd) {
          console.error('❌ Java is required to run WireMock but was not found on your PATH.');
          process.exit(1);
        }

        const args = ['-jar', resolvedJar, '--port', String(effectivePort), '--root-dir', resolve(dir), '--verbose', 'true'];

        // Setup log file for background process (unless logging disabled)
        let logFilePath: string | undefined;
        if (!noLogs) {
          const logResult = openLogFileForBackground({
            port: effectivePort,
            rootDir: resolve(dir),
            logDir,
          });
          logFilePath = logResult.logFilePath;
        }

        const pid = spawnBackground(javaCmd, args, { port: effectivePort, rootDir: resolve(dir), logFile: logFilePath });

        console.log(`✅ WireMock started on port ${effectivePort} (PID: ${pid})`);
        if (!quiet && logFilePath) console.log(`   Log: ${logFilePath}`);
        process.exit(0);
      }

    } catch (error) {
      console.error(`❌ ${formatErrorMessage(error)}`);
      if (verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      } else {
        console.error('Run with -v for full stack trace');
      }
      process.exit(1);
    }
  });

// ─── config subcommand ───────────────────────────────────────────────────────

const CONFIG_HELP_GLOBAL = `
Usage:
  stw config set <key> <value>       Set global config
  stw config set -l <key> <value>    Set local project config (.stwrc.yaml)

Global config keys (stored in ~/.swagger-to-wiremock/config.json):

  jar <path>              Path to WireMock standalone JAR (e.g. ./wiremock.jar)
  port <number>           Default WireMock port (e.g. 8080)
  port-range-min <number> Minimum allowed port (e.g. 3000)
  port-range-max <number> Maximum allowed port (e.g. 4000)
  output-dir <path>       Parent directory for all generated stubs
  foreground <true|false> Run WireMock in foreground by default
  log-dir <path>          Directory for serve session log files
  no-logs <true|false>    Disable session logging entirely
  auto-port <true|false>  Auto-increment port when unavailable (default: true)
`;

const CONFIG_HELP_LOCAL = `
Local config keys (stored in .stwrc.yaml in project root):

  output <path>           Output directory for this project
  output-dir <path>       Parent directory for generated stubs
  seed <number>           Seed for deterministic response generation
  flat <true|false>       Single folder output (no status-class split)
  status <codes>          Filter stubs by status (e.g. 2xx, 4xx,5xx, 200,404)
  no-security <true|false>  Skip security scheme matchers
  empty <true|false>      Generate skeleton stubs with placeholder bodies
  serve <true|false>      Auto-start WireMock after convert
  port <number>           WireMock port
  jar <path>              Path to WireMock standalone JAR
  foreground <true|false> Run WireMock in foreground by default
  verbose <true|false>    Enable verbose logging
  quiet <true|false>      Suppress all output except errors
  log-dir <path>          Directory for serve session log files (default: ~/.swagger-to-wiremock/logs/)
  no-logs <true|false>    Disable session logging entirely
  templated <true|false>  Use WireMock response templating
  dry-run <true|false>    Show what would be generated without writing
`;

const configCmd = program
  .command('config')
  .description('Manage global and local project configuration')
  .addHelpText('after', CONFIG_HELP_GLOBAL + CONFIG_HELP_LOCAL);

configCmd
  .command('set <key> <value>')
  .description('Set a config value')
  .option('-l, --local', 'Save to local project config (.stwrc.yaml) instead of global')
  .action((key: string, value: string, options: { local?: boolean }) => {
    if (options.local) {
      // Write to .stwrc.yaml in cwd
      try {
        writeLocalConfig(key, value);
        console.log(`✅ Set ${key} = ${value} (local: .stwrc.yaml)`);
      } catch (error) {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    } else {
      if (!isValidKey(key)) {
        console.error(`❌ Unknown global config key: "${key}".`);
        console.error(`   Valid keys: ${getValidKeys().join(', ')}`);
        console.error('   Use -l for local project config (supports more keys).');
        process.exit(1);
      }

      try {
        setConfig(key, value);
        const resolved = getConfig(key);
        console.log(`✅ Set ${key} = ${resolved}`);
      } catch (error) {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
  });

configCmd
  .command('get <key>')
  .description('Get a config value')
  .option('-l, --local', 'Read from local project config (.stwrc.yaml)')
  .action((key: string, options: { local?: boolean }) => {
    if (options.local) {
      const { config: projectConfig, source } = loadProjectConfig();
      const val = (projectConfig as Record<string, unknown>)[key];
      if (val === undefined) {
        console.log(`${key}: (not set)${source ? ` [${source}]` : ''}`);
      } else {
        console.log(`${key}: ${val}${source ? ` [${source}]` : ''}`);
      }
    } else {
      if (!isValidKey(key)) {
        console.error(`❌ Unknown global config key: "${key}".`);
        console.error(`   Valid keys: ${getValidKeys().join(', ')}`);
        process.exit(1);
      }

      const value = getConfig(key);
      if (value === undefined) {
        console.log(`${key}: (not set)`);
      } else {
        console.log(`${key}: ${value}`);
      }
    }
  });

configCmd
  .command('unset <key>')
  .description('Remove a config value')
  .option('-l, --local', 'Remove from local project config (.stwrc.yaml)')
  .action((key: string, options: { local?: boolean }) => {
    if (options.local) {
      try {
        unsetLocalConfig(key);
        console.log(`✅ Removed ${key} from .stwrc.yaml`);
      } catch (error) {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    } else {
      if (!isValidKey(key)) {
        console.error(`❌ Unknown global config key: "${key}".`);
        console.error(`   Valid keys: ${getValidKeys().join(', ')}`);
        process.exit(1);
      }
      unsetConfig(key);
      console.log(`✅ Removed ${key}`);
    }
  });

configCmd
  .command('list')
  .description('Show all config values')
  .option('-l, --local', 'Show local project config (.stwrc.yaml)')
  .action((options: { local?: boolean }) => {
    if (options.local) {
      const { config: projectConfig, source } = loadProjectConfig();
      const entries = Object.entries(projectConfig);
      if (entries.length === 0) {
        console.log('No local project config found.');
        console.log('Run "stw init" to create a .stwrc.yaml, or use "stw config set -l <key> <value>".');
        return;
      }
      console.log(`Local config${source ? ` (${source})` : ''}:`);
      for (const [key, value] of entries) {
        console.log(`  ${key}: ${value}`);
      }
    } else {
      const config = listConfig();
      const entries = Object.entries(config);

      if (entries.length === 0) {
        console.log('No global config set.');
        console.log('Config file: ~/.swagger-to-wiremock/config.json');
        return;
      }

      console.log('Global config:');
      for (const [key, value] of entries) {
        console.log(`  ${key}: ${value}`);
      }
    }
  });

// ─── status subcommand ───────────────────────────────────────────────────────

// ─── init subcommand ─────────────────────────────────────────────────────────

program
  .command('init')
  .description('Generate a .stwrc.yaml config file with all options documented')
  .option('-f, --force', 'Overwrite existing config file')
  .action((options: { force?: boolean }) => {
    const result = initConfig({ force: options.force });

    if (!result.created) {
      console.error(`⚠️  ${result.reason}`);
      process.exit(1);
    }

    console.log(`✅ Created ${result.path}`);
    console.log('   Edit the file to uncomment and set your preferred defaults.');
  });

// ─── status subcommand ───────────────────────────────────────────────────────

program
  .command('status')
  .description('List running background WireMock servers')
  .action(() => {
    const servers = getServerStatus();

    if (servers.length === 0) {
      console.log('No running WireMock servers.');
      return;
    }

    console.log('Running servers:');
    console.log('');
    console.log('  PORT   PID       STARTED            STUBS');
    console.log('  ────   ───       ───────            ─────');

    for (const entry of servers) {
      const status = entry.alive ? '' : ' (dead)';
      const started = entry.startedAt.replace('T', ' ').replace(/:\d{2}\.\d+Z$/, '').replace(/:\d{2}Z$/, '');
      const port = String(entry.port).padEnd(6);
      const pid = String(entry.pid).padEnd(9);
      const stubs = formatStubsDir(entry.rootDir);
      console.log(`  ${port} ${pid} ${started.padEnd(18)} ${stubs}${status}`);
      if (entry.logFile) {
        console.log(`         Log: ${entry.logFile}`);
        console.log('');
      }
    }

    console.log('');
  });

// ─── dir subcommand ──────────────────────────────────────────────────────────

program
  .command('dir')
  .description('Print the resolved wiremock output directory (for use with cd)')
  .action(() => {
    const { config: projectConfig } = loadProjectConfig();
    const outputDir = resolveConfig<string | undefined>(
      undefined, projectConfig as Record<string, unknown>, 'output-dir', 'output-dir', undefined,
    );

    if (outputDir) {
      const resolved = resolve(outputDir);
      // Output POSIX-style path for MINGW/Git Bash compatibility
      process.stdout.write(toPosixPath(resolved) + '\n');
    } else {
      process.stderr.write('output-dir is not set. Use: stw config set output-dir <path>\n');
      process.exit(1);
    }
  });

// ─── stop subcommand ─────────────────────────────────────────────────────────

program
  .command('stop [port]')
  .description('Stop a background WireMock server by port, or --all to stop all')
  .option('-a, --all', 'Stop all running servers')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (port: string | undefined, options: { all?: boolean; yes?: boolean }) => {
    if (options.all) {
      // Get server entries before stopping (for temp dir cleanup)
      const servers = getServerStatus().filter((s) => s.alive);

      if (servers.length === 0) {
        console.log('No running WireMock servers to stop.');
        return;
      }

      // Confirm before stopping all
      if (!options.yes) {
        console.log(`Found ${servers.length} running server${servers.length > 1 ? 's' : ''}:`);
        for (const s of servers) {
          console.log(`  Port ${s.port} (PID: ${s.pid})`);
        }
        const confirmed = await confirmPrompt('Stop all?');
        if (!confirmed) {
          console.log('Cancelled.');
          return;
        }
      }

      const count = stopAllServers();
      // Clean up any temp dirs
      for (const server of servers) { cleanupTempStubDir(server.rootDir); }
      console.log(`✅ Stopped ${count} WireMock server${count > 1 ? 's' : ''}`);
      return;
    }

    if (!port) {
      console.error('❌ Please specify a port to stop, or use --all to stop all servers.');
      console.error('   Usage: stw stop <port>');
      console.error('   Usage: stw stop --all');
      process.exit(1);
    }

    const portNum = parseInt(port, 10);
    if (Number.isNaN(portNum)) {
      console.error(`❌ Invalid port: "${port}". Must be a number.`);
      process.exit(1);
    }

    const result = stopServer(portNum);
    if (result.success && result.entry) {
      console.log(`✅ Stopped WireMock on port ${portNum} (PID: ${result.entry.pid})`);
      cleanupTempStubDir(result.entry.rootDir);
    } else {
      console.error(`❌ No running server found on port ${portNum}.`);
      console.error('   Run "stw status" to see active servers.');
      process.exit(1);
    }
  });

// ─── logs subcommand ─────────────────────────────────────────────────────────

program
  .command('logs')
  .description('List or tail serve session log files')
  .option('-p, --port <port>', 'Show log for a specific port (looks up running server registry)')
  .option('-t, --tail', 'Tail the latest (or port-specific) log file')
  .option('-n, --lines <count>', 'Number of lines to show when tailing (default: 50)', '50')
  .option('--clear', 'Delete all log files in the log directory')
  .action((options: { port?: string; tail?: boolean; lines?: string; clear?: boolean }) => {
    const { config: logsProjectCfg } = loadProjectConfig();

    // Resolve explicitly configured log directory (if set in config)
    const configuredLogDir = resolveConfig<string | undefined>(
      undefined, logsProjectCfg as Record<string, unknown>, 'log-dir', 'log-dir', undefined,
    );

    // If port is specified, try to find log from registry first
    if (options.port) {
      const portNum = parseInt(options.port, 10);
      const servers = getServerStatus();
      const entry = servers.find((s) => s.port === portNum);

      if (entry?.logFile && existsSync(entry.logFile)) {
        if (options.tail) {
          tailFile(entry.logFile, parseInt(options.lines ?? '50', 10));
        } else {
          console.log(`Log for port ${portNum}: ${entry.logFile}`);
        }
        return;
      }
    }

    // Resolve log directory: config > default (~/.swagger-to-wiremock/logs/)
    const logDirPath = configuredLogDir ?? join(homedir(), '.swagger-to-wiremock', 'logs');

    if (options.clear) {
      if (!existsSync(logDirPath)) {
        console.log('No log directory found. Nothing to clear.');
        return;
      }
      const files = listLogFiles(logDirPath, 1000);
      if (files.length === 0) {
        console.log('No log files found.');
        return;
      }
      for (const file of files) {
        rmSync(file.path);
      }
      console.log(`✅ Deleted ${files.length} log file${files.length > 1 ? 's' : ''}`);
      return;
    }

    const logFiles = listLogFiles(logDirPath);

    if (logFiles.length === 0) {
      console.log(`No log files found in: ${logDirPath}`);
      console.log('Start a server with "stw serve" to generate logs.');
      return;
    }

    if (options.tail) {
      // Tail the most recent log file
      tailFile(logFiles[0]!.path, parseInt(options.lines ?? '50', 10));
      return;
    }

    // List log files
    console.log(`Log directory: ${logDirPath}`);
    console.log('');
    console.log('  FILE                                  SIZE       DATE');
    console.log('  ────                                  ────       ────');
    for (const file of logFiles) {
      const size = file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`;
      const date = file.mtime.toISOString().replace('T', ' ').replace(/:\d{2}\.\d+Z$/, '');
      console.log(`  ${file.name.padEnd(38)}${size.padEnd(10)} ${date}`);
    }
    console.log('');
  });

/** Read the last N lines of a file and print to stdout */
function tailFile(filePath: string, lines: number): void {
  const content = readFileSync(filePath, 'utf8') as string;
  const allLines = content.split('\n');
  const tail = allLines.slice(-lines).join('\n');
  console.log(`─── ${filePath} (last ${lines} lines) ───`);
  console.log(tail);
}

program.parseAsync();
