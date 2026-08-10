/**
 * @file Type declarations for swagger2openapi
 * @description The @types/swagger2openapi package has incomplete or missing exports.
 *   This file provides the minimal declarations needed for our usage.
 */

declare module 'swagger2openapi' {
  interface ConvertOptions {
    patch?: boolean;
    warnOnly?: boolean;
    direct?: boolean;
    [key: string]: unknown;
  }

  interface ConvertResult {
    openapi: object;
    warnings?: unknown[];
  }

  export function convertObj(spec: object, options?: ConvertOptions): Promise<ConvertResult>;
}
