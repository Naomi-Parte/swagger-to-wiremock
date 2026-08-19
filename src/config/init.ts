/**
 * @file `stw init` — scaffold a .stwrc.yaml with all available options documented
 * @description Generates a fully-commented .stwrc.yaml in the current directory,
 *   making it easy for teams to discover and configure all project-level options.
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

/** The template content for the generated .stwrc.yaml */
const TEMPLATE = `# swagger-to-wiremock project configuration
# Docs: https://github.com/naomi-parte/swagger-to-wiremock#project-config
#
# This file provides default options for the "stw convert" command.
# CLI flags always override values set here.
#
# Place this file in your project root (next to package.json).
# Discovery order: .stwrc.yaml > .stwrc.yml > .stwrc.json > package.json key

# ─── Output ───────────────────────────────────────────────────────────────────

# Output directory for generated WireMock stubs
# output: ./wiremock

# Parent directory for all generated stubs (spec name becomes a subfolder)
# e.g. output-dir: ./wiremock → stw convert petstore.yaml → ./wiremock/petstore/
# output-dir: ./wiremock

# Use a single mappings/__files folder (no 2xx/4xx subfolder split)
# flat: false

# ─── Generation ───────────────────────────────────────────────────────────────

# Seed for deterministic faker-generated response data (any integer)
# seed: 42

# Only generate stubs for specific status codes
# Examples: "2xx", "4xx,5xx", "200,201,404"
# status: 2xx

# Generate skeleton stubs with TODO placeholder response bodies
# empty: false

# Skip security scheme matchers (no auth headers in request matching)
# no-security: false

# ─── Server ───────────────────────────────────────────────────────────────────

# Auto-start WireMock server after generation
# serve: false

# Port for WireMock server
# port: 8080

# Port range restriction (global config only — not project-level)
# Limits which ports stw is allowed to use. Prevents port-hoarding in shared environments.
# Set via: stw config set port-range-min 3000 / stw config set port-range-max 4000
# port-range-min: 1
# port-range-max: 65535

# Run WireMock in foreground by default (block until Ctrl+C)
# foreground: false

# Path to WireMock standalone JAR (absolute or relative to project root)
# jar: /path/to/wiremock-standalone.jar

# ─── Logging ──────────────────────────────────────────────────────────────────

# Enable verbose logging
# verbose: false

# Directory for serve session log files (default: <output-dir>/logs)
# log-dir: ./logs

# Disable session logging entirely
# no-logs: false

# Suppress all output except errors
# quiet: false

# ─── Other ────────────────────────────────────────────────────────────────────

# Preview what would be generated without writing files
# dry-run: false
`;

export interface InitOptions {
  /** Working directory to write the config file in (defaults to cwd) */
  cwd?: string;
  /** Overwrite existing config file without prompting */
  force?: boolean;
}

export interface InitResult {
  /** Whether the file was written */
  created: boolean;
  /** Path to the config file */
  path: string;
  /** Reason if not created */
  reason?: string;
}

/**
 * Scaffold a .stwrc.yaml file in the target directory.
 */
export function initConfig(options: InitOptions = {}): InitResult {
  const dir = options.cwd ?? process.cwd();
  const filePath = join(dir, '.stwrc.yaml');

  // Check for existing config files
  if (!options.force) {
    const existingFiles = ['.stwrc.yaml', '.stwrc.yml', '.stwrc.json'].filter((name) =>
      existsSync(join(dir, name)),
    );

    if (existingFiles.length > 0) {
      const existing = existingFiles[0]!;
      return {
        created: false,
        path: join(dir, existing),
        reason: `Config file already exists: ${existing}. Use --force to overwrite.`,
      };
    }
  }

  writeFileSync(filePath, TEMPLATE, 'utf8');

  return { created: true, path: filePath };
}
