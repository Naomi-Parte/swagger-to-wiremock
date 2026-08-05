/**
 * @file Validate OpenAPI version
 * @description Ensures spec is OpenAPI 3.0.x, rejects 2.0 and 3.1
 */

import { ParserError } from '../errors/parser-error.js';

/**
 * Extract OpenAPI version from spec
 * @param spec - Parsed OpenAPI spec object
 * @returns Semantic version string (e.g., "3.0.0")
 * @throws ParserError if openapi/swagger field is missing
 */
function extractVersion(spec: Record<string, unknown>): string {
  // OpenAPI 3.0+ uses 'openapi' field
  if (typeof spec.openapi === 'string') {
    return spec.openapi;
  }

  // Swagger 2.0 uses 'swagger' field
  if (typeof spec.swagger === 'string') {
    return spec.swagger;
  }

  throw new ParserError('INVALID_SPEC', 'Neither "openapi" nor "swagger" field found in spec', {
    specKeys: Object.keys(spec),
  });
}

/**
 * Parse version string into major, minor, patch
 * @param version - Version string (e.g., "3.0.0")
 * @returns Object with major, minor, patch
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const parts = version.split('.').map((v) => parseInt(v, 10));

  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
  };
}

/**
 * Validate that spec is OpenAPI 3.0.x
 * @param spec - Parsed OpenAPI spec
 * @returns Version string if valid
 * @throws ParserError if version is unsupported (2.0, 3.1, etc.)
 */
export function validateOpenAPIVersion(spec: Record<string, unknown>): string {
  const version = extractVersion(spec);
  const { major, minor } = parseVersion(version);

  // Support only OpenAPI 3.0.x
  if (major === 3 && minor === 0) {
    return version;
  }

  // Specific message for Swagger 2.0
  if (major === 2) {
    throw new ParserError(
      'UNSUPPORTED_VERSION',
      `Swagger 2.0 is not supported. Please convert your spec to OpenAPI 3.0.x first.`,
      { version, major, minor },
    );
  }

  // Specific message for OpenAPI 3.1
  if (major === 3 && minor === 1) {
    throw new ParserError(
      'UNSUPPORTED_VERSION',
      `OpenAPI 3.1.x is not yet supported. Please use OpenAPI 3.0.x instead.`,
      { version, major, minor },
    );
  }

  // Generic message for other versions
  throw new ParserError(
    'UNSUPPORTED_VERSION',
    `OpenAPI version ${version} is not supported. Supported: 3.0.0–3.0.3`,
    { version, major, minor },
  );
}
