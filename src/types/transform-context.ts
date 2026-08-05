/**
 * @file Transformation context carrying configuration through the pipeline
 * @description Holds CLI options and state used across parsing, transformation, and generation stages
 */

/**
 * Context object passed through the conversion pipeline
 * @description Carries configuration, options, and diagnostic information from CLI through all pipeline stages
 */
export interface TransformContext {
  /** Seed for deterministic random number generation (optional) */
  seed?: string | number;

  /** Enable verbose logging */
  verbose: boolean;

  /** Input file path (absolute or relative) */
  inputPath: string;

  /** Output directory path (absolute or relative) */
  outputDir: string;

  /** Resolved OpenAPI spec (after validation and dereferencing) */
  spec?: Record<string, unknown>;

  /** OpenAPI version detected (e.g., "3.0.0", "3.1.0") */
  specVersion?: string;

  /** Diagnostic messages accumulated during processing */
  diagnostics: string[];
}
