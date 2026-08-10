/**
 * @file Swagger 2.0 → OpenAPI 3.0 conversion
 * @description Wraps swagger2openapi to convert a raw Swagger 2.0 document into
 * an OpenAPI 3.0 document in-memory. Downstream pipeline stages never see Swagger 2.0.
 */

import { convertObj } from 'swagger2openapi';
import { ParserError } from '../errors/parser-error.js';

/**
 * Result of a Swagger 2.0 → OpenAPI 3.0 conversion
 */
export interface Swagger2ConversionResult {
  /** The converted OpenAPI 3.0 document */
  openapi: Record<string, unknown>;

  /** Non-fatal warnings produced by swagger2openapi during conversion */
  warnings: string[];
}

/**
 * Convert a Swagger 2.0 document into an OpenAPI 3.0 document
 * @param spec - Raw Swagger 2.0 spec object
 * @returns The converted OpenAPI 3.0 document and any conversion warnings
 * @throws ParserError with code 'SWAGGER2_CONVERSION_ERROR' if conversion fails
 */
export async function convertSwagger2ToOpenApi3(
  spec: Record<string, unknown>,
): Promise<Swagger2ConversionResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await convertObj(spec as any, {
      patch: true, // fix common spec errors
      warnOnly: true, // don't throw on non-critical issues
    });

    const warnings = (result.warnings ?? []).map((warning: unknown) =>
      typeof warning === 'string' ? warning : JSON.stringify(warning),
    );

    return {
      openapi: result.openapi as unknown as Record<string, unknown>,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new ParserError(
      'SWAGGER2_CONVERSION_ERROR',
      `Swagger 2.0 auto-conversion failed: ${message}. ` +
        'Ensure the spec is valid Swagger 2.0, or convert manually using https://editor.swagger.io',
      { originalError: message },
    );
  }
}
