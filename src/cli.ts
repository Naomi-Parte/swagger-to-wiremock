#!/usr/bin/env node

/**
 * @file CLI entry point for openapi-to-wiremock
 * @description Parses command-line arguments and orchestrates the conversion pipeline
 */

import { program } from 'commander';
import { parseOpenAPISpec } from './parser/index.js';
import { transformSpec } from './transformer/index.js';
import { generateMappings } from './generator/index.js';
import { writeStubs } from './writer/index.js';
import { ParserError } from './errors/parser-error.js';

const version = '0.0.1';

const EXAMPLES = `
Examples:
  $ openapi-to-wiremock convert ./petstore.yaml
  $ openapi-to-wiremock convert ./api.yaml -o ./wiremock-stubs
  $ openapi-to-wiremock convert ./api.yaml -o ./stubs -s 99 -v
  $ openapi-to-wiremock convert ./api.yaml --dry-run
  $ openapi-to-wiremock convert ./api.yaml --no-clean -o ./existing-stubs
`;

interface ConvertOptions {
  output: string;
  seed?: string;
  verbose?: boolean;
  quiet?: boolean;
  clean?: boolean; // Commander handles --no-clean as clean=false
  dryRun?: boolean;
  helpExamples?: boolean;
}

/**
 * Format a caught error into a user-facing message, tailoring known ParserError
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

  return error instanceof Error ? error.message : String(error);
}

program
  .name('openapi-to-wiremock')
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
      const spec = await parseOpenAPISpec(input);

      // Step 2: Transform
      log('[info] Transforming to IR...');
      const records = transformSpec(spec);
      log(`[info] ${records.length} operations found`);

      // Step 3: Generate mappings
      log('[info] Generating mappings...');
      const mappings = generateMappings(records, seed);
      log(`[info] ${mappings.length} mappings generated`);

      // Step 4: Write to disk
      log('[info] Writing files...');
      const result = await writeStubs(mappings, records, {
        outputDir: options.output,
        clean: options.clean ?? true,
        dryRun: options.dryRun ?? false,
        seed,
      });

      // Summary
      if (!quiet) {
        console.log(`✅ Generated ${result.mappingFiles.length} mappings → ${options.output}`);
        console.log(`   ${result.bodyFiles.length} response body files`);
        console.log(`   ${(result.totalBytes / 1024).toFixed(1)} KB total`);
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

program.parse();
