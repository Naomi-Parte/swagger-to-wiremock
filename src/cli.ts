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

const version = '0.0.1';

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
  .option('--help-examples', 'Show usage examples')
  .action(async (input: string, options: { output: string; seed?: string; verbose?: boolean }) => {
    try {
      const seed = options.seed ? parseInt(options.seed, 10) : 42;

      if (options.verbose) console.log(`[info] Input: ${input}`);
      if (options.verbose) console.log(`[info] Output: ${options.output}`);
      if (options.verbose) console.log(`[info] Seed: ${seed}`);

      // Step 1: Parse
      if (options.verbose) console.log('[info] Parsing spec...');
      const spec = await parseOpenAPISpec(input);

      // Step 2: Transform
      if (options.verbose) console.log('[info] Transforming to IR...');
      const records = transformSpec(spec);
      if (options.verbose) console.log(`[info] ${records.length} operations found`);

      // Step 3: Generate mappings
      if (options.verbose) console.log('[info] Generating mappings...');
      const mappings = generateMappings(records, seed);
      if (options.verbose) console.log(`[info] ${mappings.length} mappings generated`);

      // Step 4: Write to disk
      if (options.verbose) console.log('[info] Writing files...');
      const result = await writeStubs(mappings, records, {
        outputDir: options.output,
        clean: true,
        seed,
      });

      // Summary
      console.log(`✅ Generated ${result.mappingFiles.length} mappings → ${options.output}`);
      console.log(`   ${result.bodyFiles.length} response body files`);
      console.log(`   ${(result.totalBytes / 1024).toFixed(1)} KB total`);

      process.exit(0);
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program.parse();
