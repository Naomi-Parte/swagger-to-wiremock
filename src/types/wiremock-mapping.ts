/**
 * @file WireMock mapping container type
 * @description Represents a complete WireMock stub mapping including request matcher and response
 */

import type { WireMockRequest } from './wiremock-request.js';
import type { WireMockResponse } from './wiremock-response.js';

/**
 * Complete WireMock stub mapping as written to mappings/*.json
 */
export interface WireMockMapping {
  /** Unique identifier for the mapping (UUID) */
  id: string;

  /** Human-readable name describing the operation and status (e.g., "GET /pets - 200") */
  name: string;

  /** Priority for matching (lower wins; 2xx=1, 4xx=5, 5xx=10) */
  priority: number;

  /** Request matcher specification */
  request: WireMockRequest;

  /** Response specification */
  response: WireMockResponse;

  /** Optional metadata (e.g., source OpenAPI operation, conversion metadata) */
  metadata?: Record<string, unknown>;

  /** Fixed delay in milliseconds (from x-wiremock-delay type=fixed) */
  fixedDelayMilliseconds?: number;

  /** Delay distribution (from x-wiremock-delay type=uniform|lognormal) */
  delayDistribution?: {
    type: 'uniform' | 'lognormal';
    lower?: number;
    upper?: number;
    median?: number;
    sigma?: number;
  };

  /** Scenario name (from x-wiremock-scenario) */
  scenarioName?: string;

  /** Required scenario state (from x-wiremock-scenario) */
  requiredScenarioState?: string;

  /** New scenario state after match (from x-wiremock-scenario) */
  newScenarioState?: string;
}
