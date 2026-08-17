/**
 * @file WireMock mapping generator
 * @description Converts operation records into WireMock mapping JSON objects
 */

import { randomBytes } from 'crypto';
import type { OperationRecord } from '../types/operation-record.js';
import type { WireMockMapping } from '../types/wiremock-mapping.js';
import type { WireMockRequest } from '../types/wiremock-request.js';
import type { WireMockResponse } from '../types/wiremock-response.js';
import { generateURLPattern } from '../url-patterns/index.js';
import { createSeededRandom } from './seeded-random.js';
import { buildBodyPatterns } from './body-pattern-builder.js';
import { analyseTemplateSubstitutions } from './template-builder.js';

export interface GenerateMappingsOptions {
  /** Numeric seed for deterministic IDs (undefined = random) */
  seed?: number;
  /** When true, generate WireMock response-template stubs with Handlebars expressions */
  templated?: boolean;
}

/**
 * Generate WireMock mappings from operation records.
 * @param records - Operation records to convert
 * @param options - Generation options (seed, templated, etc.)
 * @returns WireMock mappings
 */
export function generateMappings(records: OperationRecord[], options: GenerateMappingsOptions | number = {}): WireMockMapping[] {
  // Backwards compat: accept bare seed number
  const opts = typeof options === 'number' ? { seed: options } : options;
  const random = opts.seed === undefined ? undefined : createSeededRandom(opts.seed);
  const templated = opts.templated ?? false;

  return records.map((record) => {
    const urlPattern = generateURLPattern(record);
    const request: WireMockRequest = {
      method: record.method.toUpperCase(),
      urlPathPattern: urlPattern.url,
    };

    const queryParameters = buildQueryParameters(record);
    if (queryParameters) {
      request.queryParameters = queryParameters;
    }

    // Add body patterns for POST/PUT/PATCH with request body schemas
    const bodyPatterns = buildBodyPatterns(record);
    if (bodyPatterns) {
      request.bodyPatterns = bodyPatterns;
    }

    const headers: Record<string, { equalTo?: string; matches?: string }> = {};
    if (record.contentType && methodCanHaveRequestBody(record.method)) {
      headers['Content-Type'] = { equalTo: record.contentType };
    }

    // Add security scheme matchers
    if (record.securityMatchers) {
      for (const matcher of record.securityMatchers) {
        if (matcher.in === 'header') {
          headers[matcher.name] = { matches: matcher.pattern };
        } else if (matcher.in === 'query') {
          if (!request.queryParameters) request.queryParameters = {};
          request.queryParameters[matcher.name] = { matches: matcher.pattern };
        }
      }
    }

    if (Object.keys(headers).length > 0) {
      request.headers = headers;
    }

    const fileName = buildMappingFileName(record);
    const response: WireMockResponse = {
      status: normalizeStatusCode(record.statusCode),
      headers: {
        'Content-Type': record.contentType,
      },
      bodyFileName: fileName,
    };

    // Templated mode: add response-template transformer
    if (templated) {
      const analysis = analyseTemplateSubstitutions(record);
      if (analysis.hasTemplating) {
        response.transformers = ['response-template'];
        // Store substitution metadata so the writer can apply them to the body
        (response as unknown as Record<string, unknown>)['_templateSubstitutions'] = analysis.substitutions;
      }
    }

    const mapping: WireMockMapping = {
      id: random ? generateSeededId(random) : generateId(),
      name: `${record.method.toUpperCase()} ${record.path} - ${String(record.statusCode)}`,
      priority: getPriorityForStatus(record.statusCode),
      request,
      response,
      metadata: {
        operationId: record.operationId ?? record.id,
      },
    };

    // Apply x-wiremock-* extensions
    if (record.extensions) {
      const ext = record.extensions;

      // x-wiremock-priority overrides the computed priority
      if (ext.priority !== undefined) {
        mapping.priority = ext.priority;
      }

      // x-wiremock-delay
      if (ext.delay) {
        if (ext.delay.type === 'fixed' && ext.delay.milliseconds !== undefined) {
          response.fixedDelayMilliseconds = ext.delay.milliseconds;
        } else if (ext.delay.type === 'uniform') {
          response.delayDistribution = {
            type: 'uniform',
            lower: ext.delay.lower,
            upper: ext.delay.upper,
          };
        } else if (ext.delay.type === 'lognormal') {
          response.delayDistribution = {
            type: 'lognormal',
            median: ext.delay.median,
            sigma: ext.delay.sigma,
          };
        }
      }

      // x-wiremock-scenario
      if (ext.scenario) {
        mapping.scenarioName = ext.scenario.name;
        if (ext.scenario.requiredState !== undefined) {
          mapping.requiredScenarioState = ext.scenario.requiredState;
        }
        if (ext.scenario.newState !== undefined) {
          mapping.newScenarioState = ext.scenario.newState;
        }
      }
    }

    return mapping;
  });
}

/**
 * Determine whether an HTTP method can carry a request body in this generator context.
 * @param method - HTTP method string
 * @returns True when request body header matching should be applied
 */
function methodCanHaveRequestBody(method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod === 'POST' || normalizedMethod === 'PUT' || normalizedMethod === 'PATCH';
}

/**
 * Build query parameter matchers from required query params only.
 * @param record - Operation record
 * @returns Query parameter matcher map or undefined
 */
function buildQueryParameters(
  record: OperationRecord,
): Record<string, { equalTo?: string; matches?: string }> | undefined {
  const required = record.queryParams.filter((param) => param.required);
  if (required.length === 0) {
    return undefined;
  }

  const queryParameters: Record<string, { equalTo?: string; matches?: string }> = {};
  required.forEach((param) => {
    if (param.enum && param.enum.length > 0) {
      queryParameters[param.name] = {
        matches: param.enum.map((value) => escapeRegex(String(value))).join('|'),
      };
      return;
    }

    queryParameters[param.name] = { matches: '.+' };
  });

  return queryParameters;
}

/**
 * Get WireMock priority based on status code class.
 * @param statusCode - Operation status code
 * @returns Priority value (lower is higher priority)
 */
function getPriorityForStatus(statusCode: number | string): number {
  if (statusCode === 'default') {
    return 100;
  }

  const numericCode = Number(statusCode);
  if (numericCode >= 200 && numericCode < 300) {
    return 1;
  }
  if (numericCode >= 400 && numericCode < 500) {
    return 5;
  }
  if (numericCode >= 500 && numericCode < 600) {
    return 10;
  }

  return 100;
}

/**
 * Normalize status code for WireMock response.
 * @param statusCode - Operation status code
 * @returns Numeric HTTP status code
 */
function normalizeStatusCode(statusCode: number | string): number {
  if (statusCode === 'default') {
    return 500;
  }

  return Number(statusCode);
}

/**
 * Build deterministic filename for mapping and body file.
 * @param record - Operation record
 * @returns File name in `{method}-{path-segments}-{status}.json` format
 */
function buildMappingFileName(record: OperationRecord): string {
  const method = record.method.toLowerCase();
  const pathSegments = record.path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/[{}]/g, ''))
    .join('-');

  const status = String(record.statusCode).toLowerCase();
  const middle = pathSegments.length > 0 ? pathSegments : 'root';

  return `${method}-${middle}-${status}.json`;
}

/**
 * Escape regex metacharacters in enum values.
 * @param value - Raw enum string
 * @returns Escaped regex-safe string
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a UUID v4 for WireMock mapping IDs.
 * @returns UUID string
 */
function generateId(): string {
  const buffer = randomBytes(16);
  const byte6 = buffer[6] ?? 0;
  const byte8 = buffer[8] ?? 0;
  buffer[6] = (byte6 & 0x0f) | 0x40;
  buffer[8] = (byte8 & 0x3f) | 0x80;

  const hex = buffer.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generate a deterministic UUID v4 for WireMock mapping IDs using a seeded PRNG.
 * @param random - Deterministic [0, 1) random number generator
 * @returns UUID string
 */
function generateSeededId(random: () => number): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
