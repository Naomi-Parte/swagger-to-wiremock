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

export { ParserError } from './errors/parser-error.js';
export { BaseError } from './errors/base-error.js';
