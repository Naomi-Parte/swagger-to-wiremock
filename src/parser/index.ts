/**
 * @file Main parser orchestrator
 * @description Loads, validates, and dereferences OpenAPI specs
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import { loadSpecFromFile } from './load-spec.js';
import { validateOpenAPIVersion } from './validate-version.js';
import { ParserError } from '../errors/parser-error.js';

/**
 * Options for parser
 */
export interface ParseOptions {
  /** Allow remote references (default: true) */
  allowRemote?: boolean;

  /** Cache remote fetches (default: true) */
  cacheRemote?: boolean;

  /** Maximum dereferencing depth to prevent infinite recursion (default: 50) */
  maxDepth?: number;

  /** Enable verbose diagnostics (default: false) */
  verbose?: boolean;
}

/**
 * Parse and dereference OpenAPI 3.0 specification
 * @param filePath - Path to OpenAPI spec file (JSON or YAML)
 * @param options - Parser configuration
 * @returns Fully dereferenced OpenAPI spec
 * @throws ParserError if spec is invalid, unsupported, or has unresolvable references
 *
 * @example
 * ```typescript
 * const spec = await parseOpenAPISpec('./petstore.yaml');
 * console.log(spec.info.title); // "Swagger Petstore"
 * ```
 */
export async function parseOpenAPISpec(
  filePath: string,
  options: ParseOptions = {},
): Promise<Record<string, unknown>> {
  const { allowRemote = true, verbose = false } = options;

  // Step 1: Load spec file (JSON/YAML)
  if (verbose) console.log(`[Parser] Loading spec from: ${filePath}`);
  const spec = loadSpecFromFile(filePath);

  // Step 2: Validate version
  if (verbose) console.log('[Parser] Validating OpenAPI version...');
  const version = validateOpenAPIVersion(spec);
  if (verbose) console.log(`[Parser] Spec version: ${version}`);

  // Step 3: Dereference $ref pointers
  if (verbose) console.log('[Parser] Dereferencing $ref pointers...');

  try {
    // Use SwaggerParser to dereference the spec
    // Pass the spec object (not the file path) to dereference, with the file path as base URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dereferenced = await (SwaggerParser as any).dereference(spec, {
      resolve: {
        http: allowRemote,
        file: true,
      },
    });

    if (verbose) console.log('[Parser] Dereferencing complete');
    return dereferenced as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Circular')) {
      throw new ParserError('CIRCULAR_REF', `Circular reference detected: ${message}`, {
        originalError: message,
      });
    }

    if (message.includes('resolve')) {
      throw new ParserError('INVALID_SPEC', `Failed to resolve references: ${message}`, {
        originalError: message,
      });
    }

    throw new ParserError('PARSE_ERROR', `Failed to dereference spec: ${message}`, {
      originalError: message,
    });
  }
}
