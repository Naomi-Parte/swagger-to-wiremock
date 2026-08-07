/**
 * @file Main entry point for openapi-to-wiremock library
 * @description Re-exports all public types and functions for library consumers
 */

export type { WireMockMapping } from './types/wiremock-mapping.js';
export type { WireMockRequest } from './types/wiremock-request.js';
export type { WireMockResponse } from './types/wiremock-response.js';
export type { OperationRecord } from './types/operation-record.js';
export type { TransformContext } from './types/transform-context.js';

export { parseOpenAPISpec } from './parser/index.js';
export type { ParseOptions } from './parser/index.js';

export { transformSpec } from './transformer/index.js';

export { generateURLPattern } from './url-patterns/index.js';
export type { URLPatternResult } from './url-patterns/index.js';
export { getPathParamPattern, PATH_PARAM_PATTERNS } from './url-patterns/path-param-patterns.js';

export { generateResponseBody } from './generator/response-builder.js';
export { generateMappings } from './generator/index.js';
export { writeStubs } from './writer/index.js';
export type { WriteOptions, WriteResult } from './writer/index.js';

export { ParserError } from './errors/parser-error.js';
export { BaseError } from './errors/base-error.js';

export { parseStatusFilter, filterByStatus, statusMatchesFilter } from './filters/status-filter.js';
export type { StatusFilter } from './filters/status-filter.js';
export {
  synthesisePlaceholderRecords,
  extractSpecificCodes,
  createPlaceholderBody,
} from './filters/placeholder-generator.js';
export { getStatusClass, groupByStatusClass } from './filters/status-classifier.js';
