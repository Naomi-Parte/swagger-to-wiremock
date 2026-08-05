/**
 * @file WireMock request matcher type
 * @description Represents the request pattern that WireMock will match incoming requests against
 */

/**
 * Parameter matcher supporting exact match or regex pattern
 */
export interface ParameterMatcher {
  /** Exact string match */
  equalTo?: string;

  /** Regular expression match */
  matches?: string;
}

/**
 * WireMock request matcher specification
 * @description Defines how WireMock matches incoming HTTP requests
 */
export interface WireMockRequest {
  /** HTTP method (GET, POST, PUT, DELETE, PATCH, etc.) */
  method: string;

  /** URL path pattern using WireMock regex syntax (e.g., "/pets/[^/]+") */
  urlPathPattern: string;

  /** Query parameter matchers (optional; only required params included) */
  queryParameters?: Record<string, ParameterMatcher>;

  /** Header matchers (optional) */
  headers?: Record<string, ParameterMatcher>;

  /** Request body JSON pattern matchers (optional) */
  bodyPatterns?: Array<{
    equalToJson?: string;
    matchesJsonPath?: string;
  }>;
}
