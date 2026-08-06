/**
 * @file Internal representation of a single OpenAPI operation
 * @description IR record representing one operation + status code before conversion to WireMock format
 */

/**
 * Internal representation of one OpenAPI operation with a specific status code
 * @description Intermediate format used during transformation stage to normalize OpenAPI data
 *              before converting to WireMock JSON format
 */
export interface OperationRecord {
  /** Unique record ID */
  id: string;

  /** OpenAPI path (e.g., "/pets/{petId}") */
  path: string;

  /** HTTP method (lowercase: get, post, put, delete, patch) */
  method: string;

  /** HTTP status code for this response (e.g., 200, 201, 404, or "default") */
  statusCode: number | string;

  /** Operation summary from OpenAPI spec (optional) */
  summary?: string;

  /** Operation identifier from OpenAPI spec (optional) */
  operationId?: string;

  /** Operation description from OpenAPI spec (optional) */
  description?: string;

  /** Path parameters extracted from path (e.g., {petId, type, format}) */
  pathParams: Array<{
    name: string;
    type?: string;
    format?: string;
    required: boolean;
  }>;

  /** Query parameters extracted from parameters section */
  queryParams: Array<{
    name: string;
    type?: string;
    format?: string;
    required: boolean;
    enum?: (string | number)[];
  }>;

  /** Request headers extracted from parameters section */
  headers: Array<{
    name: string;
    required: boolean;
  }>;

  /** Response example (if present in spec) */
  responseExample?: unknown;

  /** Response JSON schema (if no example) */
  responseSchema?: unknown;

  /** Response Content-Type header */
  contentType: string;
}
