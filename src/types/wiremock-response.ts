/**
 * @file WireMock response type
 * @description Represents the HTTP response that WireMock will send when a request matches
 */

/**
 * WireMock response specification
 * @description Defines the HTTP response sent by WireMock when a mapping matches
 */
export interface WireMockResponse {
  /** HTTP status code (e.g., 200, 201, 404, 500) */
  status: number;

  /** Response headers (e.g., {"Content-Type": "application/json"}) */
  headers: Record<string, string>;

  /** Inline response body string (used for templated responses with Handlebars expressions) */
  body?: string;

  /** WireMock response transformers (e.g., ["response-template"] for Handlebars templating) */
  transformers?: string[];

  /** Inline JSON response body (mutually exclusive with bodyFileName) */
  jsonBody?: unknown;

  /** Reference to external file in __files/ directory (mutually exclusive with jsonBody) */
  bodyFileName?: string;
}
