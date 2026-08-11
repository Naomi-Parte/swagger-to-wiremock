#!/usr/bin/env node

/**
 * @file CLI entry point for swagger-to-wiremock
 * @description Parses command-line arguments and orchestrates the conversion pipeline
 */

import { program } from 'commander';
import { resolve, join } from 'path';
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
import { isPortOccupied, spawnBackground, getServerStatus, stopServer, stopAllServers } from './server/process-manager.js';
import { setConfig, getConfig, unsetConfig, listConfig, isValidKey, getValidKeys } from './config/index.js';

const version = '0.2.0';

const EXAMPLES = `
Examples:
  $ swagger-to-wiremock convert ./petstore.yaml
  $ swagger-to-wiremock convert ./api.yaml -o ./wiremock-stubs
  $ swagger-to-wiremock convert ./api.yaml -o ./stubs -s 99 -v
  $ swagger-to-wiremock convert ./api.yaml --dry-run
  $ swagger-to-wiremock convert ./api.yaml --no-clean -o ./existing-stubs
  $ swagger-to-wiremock convert ./api.yaml --status 2xx        # Only success responses
  $ swagger-to-wiremock convert ./api.yaml --status 4xx,5xx    # Only error responses
  $ swagger-to-wiremock convert ./api.yaml --status 400,404    # Specific status codes
  $ swagger-to-wiremock convert ./api.yaml --empty             # Skeleton with TODO bodies
  $ swagger-to-wiremock convert ./api.yaml --flat              # Single mappings/__files folder (no split)
  $ swagger-to-wiremock convert ./api.yaml --serve             # Generate + start mock server
  $ swagger-to-wiremock convert ./api.yaml --no-security       # Skip auth header matchers
  $ swagger-to-wiremock convert ./api.yaml --serve --port 9090 # Generate + serve on custom port
  $ swagger-to-wiremock serve ./wiremock-stubs                 # Start server from existing stubs
  $ swagger-to-wiremock serve ./wiremock-stubs --port 9090     # Serve on custom port
  $ swagger-to-wiremock config set jar /path/to/wiremock.jar   # Set JAR path globally
  $ swagger-to-wiremock config set port 9090                   # Set default port
  $ swagger-to-wiremock config get jar                         # Show configured JAR path
  $ swagger-to-wiremock config unset jar                       # Remove JAR config
  $ swagger-to-wiremock config list                            # Show all config
`;

interface ConvertOptions {
  output: string;
  seed?: string;
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
}

interface ServeOptions {
  port?: string;
  jar?: string;
  background?: boolean;
  verbose?: boolean;
  quiet?: boolean;
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
 * Register Ctrl+C handler for graceful server shutdown.
 */
function registerShutdownHandler(
  stopFn: () => void,
  quiet: boolean,
): void {
  const handler = (): void => {
    if (!quiet) console.log('\n[info] Shutting down WireMock...');
    stopFn();
    // Give it a moment to clean up, then exit
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}

program
  .name('swagger-to-wiremock')
  .description('Convert OpenAPI 3.0/3.1 specs to native WireMock JSON stub mappings')
  .version(version);

program
  .command('convert <input>')
  .description('Convert an OpenAPI spec to WireMock mappings')
  .option('-o, --output <dir>', 'Output directory (default: ./wiremock)', './wiremock')
  .option('-s, --seed <seed>', 'Seed for deterministic response generation (default: random)')
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
  .action(async (input: string, options: ConvertOptions) => {
    if (options.helpExamples) {
      console.log(EXAMPLES);
      process.exit(0);
    }

    const verbose = options.quiet ? false : (options.verbose ?? false);
    const quiet = options.quiet ?? false;
    const log = (message: string): void => {
      if (verbose) console.log(message);
    };

    try {
      let seed = 42;
      if (options.seed !== undefined) {
        seed = parseInt(options.seed, 10);
        if (Number.isNaN(seed)) {
          console.error('❌ Invalid seed value: must be a number');
          console.error('Run with -v for full stack trace');
          process.exit(1);
        }
      }

      log(`[info] Input: ${input}`);
      log(`[info] Output: ${options.output}`);
      log(`[info] Seed: ${seed}`);

      // Step 1: Parse
      log('[info] Parsing spec...');
      const spec = await parseOpenAPISpec(input, { verbose, quiet });

      // Step 2: Transform
      log('[info] Transforming to IR...');
      const records = transformSpec(spec);
      log(`[info] ${records.length} operations found`);

      // Strip security matchers if --no-security
      if (options.security === false) {
        log('[info] --no-security: skipping auth matchers');
        for (const record of records) {
          delete record.securityMatchers;
        }
      }

      // Step 2.5: Filter by status (if --status provided)
      let filteredRecords = records;
      let isPlaceholderMode = false;
      if (options.status) {
        const filters = parseStatusFilter(options.status);
        filteredRecords = filterByStatus(records, filters);
        log(`[info] Status filter: ${options.status} → ${filteredRecords.length}/${records.length} records`);

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
            console.warn(`⚠️ No operations match status filter "${options.status}"`);
            process.exit(0);
          }
        }
      }

      // Step 3: Generate mappings
      log('[info] Generating mappings...');
      const mappings = generateMappings(filteredRecords, seed);
      log(`[info] ${mappings.length} mappings generated`);

      // Step 4: Write to disk (skip if --dry-run + --serve, since there's nothing to serve)
      log('[info] Writing files...');
      const result = await writeStubs(mappings, filteredRecords, {
        outputDir: options.output,
        clean: options.clean ?? true,
        dryRun: options.dryRun ?? false,
        seed,
        empty: options.empty ?? false,
        flat: options.flat ?? false,
      });

      // Summary
      if (!quiet) {
        console.log(`✅ Generated ${mappings.length} mappings → ${options.output}`);
        if (result.folderCounts) {
          console.log(`   Folders: ${formatFolderSummary(result.folderCounts)}`);
        } else {
          console.log(`   ${result.bodyFiles.length} response body files`);
          console.log(`   ${(result.totalBytes / 1024).toFixed(1)} KB total`);
        }
        if (isPlaceholderMode) {
          console.log(`   ℹ️  Status ${options.status} not defined in spec — placeholder mappings generated`);
        } else if (options.empty) {
          console.log('   ℹ️  Empty templates — populate __files/*.json with your responses');
        }
      }

      // Step 5: Start server if --serve
      if (options.serve) {
        if (options.dryRun) {
          if (!quiet) console.log('[info] --dry-run: skipping server start (no files written)');
          process.exit(0);
        }

        const port = options.port ? parseInt(options.port, 10) : 8080;
        if (Number.isNaN(port) || port < 1 || port > 65535) {
          console.error('❌ Invalid port: must be a number between 1 and 65535');
          process.exit(1);
        }

        if (!quiet) console.log(`\n[info] Starting WireMock on port ${port}...`);

        const server = startServer({
          rootDir: options.output,
          port,
          jarPath: options.jar,
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
  .command('serve <dir>')
  .description('Start WireMock server from existing generated stubs')
  .option('-p, --port <port>', 'Port for WireMock server (default: 8080)')
  .option('-b, --background', 'Start server in background (detach, return immediately)')
  .option('--jar <path>', 'Path to WireMock standalone JAR')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress all output except errors')
  .action(async (dir: string, options: ServeOptions) => {
    const verbose = options.quiet ? false : (options.verbose ?? false);
    const quiet = options.quiet ?? false;

    try {
      const port = options.port ? parseInt(options.port, 10) : 8080;
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error('❌ Invalid port: must be a number between 1 and 65535');
        process.exit(1);
      }

      if (!quiet) console.log(`[info] Starting WireMock from: ${dir}`);
      if (!quiet) console.log(`[info] Port: ${port}`);

      // Background mode: spawn detached and exit immediately
      if (options.background) {
        // Check port conflict
        const portCheck = isPortOccupied(port);
        if (portCheck.occupied && portCheck.entry) {
          console.error(
            `❌ Port ${port} is already in use (PID: ${portCheck.entry.pid}, stubs: ${portCheck.entry.rootDir})`,
          );
          process.exit(1);
        }

        // Resolve JAR path
        const resolvedJar = resolveJarPath({ explicitPath: options.jar, verbose });

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

        const args = ['-jar', resolvedJar, '--port', String(port), '--root-dir', resolve(dir)];
        const pid = spawnBackground(javaCmd, args, { port, rootDir: resolve(dir) });

        console.log(`✅ WireMock started on port ${port} (PID: ${pid})`);
        process.exit(0);
      }

      const server = startServer({
        rootDir: dir,
        port,
        jarPath: options.jar,
        verbose,
      });

      registerShutdownHandler(server.stop, quiet);

      // Keep the process alive until WireMock exits
      const exitCode = await server.waitForExit();
      process.exit(exitCode ?? 0);
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

const configCmd = program
  .command('config')
  .description('Manage global configuration (~/.swagger-to-wiremock/config.json)');

configCmd
  .command('set <key> <value>')
  .description('Set a global config value (valid keys: jar, port)')
  .action((key: string, value: string) => {
    if (!isValidKey(key)) {
      console.error(`❌ Unknown config key: "${key}". Valid keys: ${getValidKeys().join(', ')}`);
      process.exit(1);
    }

    try {
      setConfig(key, value);
      console.log(`✅ Set ${key} = ${value}`);
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

configCmd
  .command('get <key>')
  .description('Get a global config value')
  .action((key: string) => {
    if (!isValidKey(key)) {
      console.error(`❌ Unknown config key: "${key}". Valid keys: ${getValidKeys().join(', ')}`);
      process.exit(1);
    }

    const value = getConfig(key);
    if (value === undefined) {
      console.log(`${key}: (not set)`);
    } else {
      console.log(`${key}: ${value}`);
    }
  });

configCmd
  .command('unset <key>')
  .description('Remove a global config value')
  .action((key: string) => {
    if (!isValidKey(key)) {
      console.error(`❌ Unknown config key: "${key}". Valid keys: ${getValidKeys().join(', ')}`);
      process.exit(1);
    }

    unsetConfig(key);
    console.log(`✅ Removed ${key}`);
  });

configCmd
  .command('list')
  .description('Show all global config values')
  .action(() => {
    const config = listConfig();
    const entries = Object.entries(config);

    if (entries.length === 0) {
      console.log('No global config set.');
      console.log(`Config file: ~/.swagger-to-wiremock/config.json`);
      return;
    }

    console.log('Global config:');
    for (const [key, value] of entries) {
      console.log(`  ${key}: ${value}`);
    }
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
    console.log('  PORT   PID       STUBS DIR                        STARTED');
    console.log('  ────   ───       ─────────                        ───────');

    for (const entry of servers) {
      const status = entry.alive ? '' : ' (dead)';
      const started = entry.startedAt.replace('T', ' ').replace(/\.\d+Z$/, '');
      const port = String(entry.port).padEnd(6);
      const pid = String(entry.pid).padEnd(9);
      const rootDir = entry.rootDir.length > 32
        ? '...' + entry.rootDir.slice(-29)
        : entry.rootDir.padEnd(32);
      console.log(`  ${port} ${pid} ${rootDir} ${started}${status}`);
    }

    console.log('');
  });

// ─── stop subcommand ─────────────────────────────────────────────────────────

program
  .command('stop [port]')
  .description('Stop a background WireMock server by port, or --all to stop all')
  .option('-a, --all', 'Stop all running servers')
  .action((port: string | undefined, options: { all?: boolean }) => {
    if (options.all) {
      const count = stopAllServers();
      if (count === 0) {
        console.log('No running WireMock servers to stop.');
      } else {
        console.log(`✅ Stopped ${count} WireMock server${count > 1 ? 's' : ''}`);
      }
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
    } else {
      console.error(`❌ No running server found on port ${portNum}.`);
      console.error('   Run "stw status" to see active servers.');
      process.exit(1);
    }
  });

program.parse();
