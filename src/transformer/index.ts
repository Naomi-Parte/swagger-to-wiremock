/**
 * @file Main transformer orchestrator
 * @description Converts OpenAPI spec into array of OperationRecord IR objects
 */

import { randomBytes } from 'crypto';
import type { OperationRecord } from '../types/operation-record.js';
import { extractPathParamNames, extractOperationParams } from './extract-params.js';
import { extractOperationResponses } from './extract-responses.js';
import { extractRequestBody } from './extract-request-body.js';
import { extractSecurityMatchers } from './extract-security.js';
import { extractWireMockExtensions } from './extension-reader.js';

/**
 * Valid HTTP methods in OpenAPI
 */
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

/**
 * Generate a UUID v4 for operation records
 * @returns UUID string
 */
function generateId(): string {
  // Use crypto for UUID v4 generation
  const buffer = randomBytes(16);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = buffer as any;
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;

  const parts = [
    buffer.toString('hex', 0, 4),
    buffer.toString('hex', 4, 6),
    buffer.toString('hex', 6, 8),
    buffer.toString('hex', 8, 10),
    buffer.toString('hex', 10, 16),
  ];

  return parts.join('-');
}

/**
 * Transform OpenAPI spec into operation records
 * @param spec - Dereferenced OpenAPI 3.0 spec
 * @returns Array of OperationRecord objects (one per operation + status code)
 *
 * @example
 * ```typescript
 * const spec = await parseOpenAPISpec('./petstore.yaml');
 * const records = transformSpec(spec);
 * // records[0] = {
 * //   id: "a1b2c3d4-...",
 * //   path: "/pets",
 * //   method: "get",
 * //   statusCode: 200,
 * //   responseExample: [...],
 * //   responseSchema: {...},
 * //   ...
 * // }
 * ```
 */
export function transformSpec(spec: Record<string, unknown>): OperationRecord[] {
  const records: OperationRecord[] = [];
  const paths = spec.paths as Record<string, unknown> | undefined;

  if (!paths) return records;

  Object.entries(paths).forEach(([path, pathItem]) => {
    const pathItemObj = pathItem as Record<string, unknown>;
    const pathParamNames = extractPathParamNames(path);

    // Iterate through HTTP methods
    HTTP_METHODS.forEach((method) => {
      const operation = pathItemObj[method] as Record<string, unknown> | undefined;
      if (!operation) return;

      // Extract parameters for this operation
      const { pathParams, queryParams, headers } = extractOperationParams(
        operation,
        pathParamNames,
      );

      // Extract request body schema (for POST/PUT/PATCH body matching)
      const requestBody = extractRequestBody(operation);

      // Extract security matchers from securitySchemes
      const securityMatchers = extractSecurityMatchers(spec, operation);

      // Extract x-wiremock-* custom extensions
      const extensions = extractWireMockExtensions(operation);

      // Extract responses (one record per status code)
      const responses = extractOperationResponses(operation);

      responses.forEach(({ statusCode, contentType, example, schema }) => {
        const record: OperationRecord = {
          id: generateId(),
          path,
          method: method.toLowerCase(),
          statusCode,
          summary: operation.summary as string | undefined,
          operationId: operation.operationId as string | undefined,
          description: operation.description as string | undefined,
          pathParams,
          queryParams,
          headers,
          responseExample: example,
          responseSchema: schema,
          contentType,
          requestBodySchema: requestBody?.schema,
          requestBodyRequired: requestBody?.required,
          requestBodyRequiredFields: requestBody?.requiredFields,
          requestBodyContentType: requestBody?.contentType,
          securityMatchers: securityMatchers.length > 0 ? securityMatchers : undefined,
          extensions,
        };

        records.push(record);
      });
    });
  });

  return records;
}
