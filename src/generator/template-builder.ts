/**
 * @file WireMock response template builder
 * @description Maps OpenAPI path/query/body parameters to WireMock Handlebars template
 *   placeholders (e.g. {{request.pathSegments.[1]}}, {{request.query.name}}).
 *   Used when `--templated` is active to produce dynamic response stubs.
 */

import type { OperationRecord } from '../types/operation-record.js';

/**
 * A single template substitution mapping.
 * Describes which response body field should be replaced with which WireMock expression.
 */
export interface TemplateSubstitution {
  /** The response body field name this substitution applies to */
  field: string;
  /** The WireMock Handlebars expression to substitute */
  expression: string;
  /** Where the value comes from: path, query, or body */
  source: 'path' | 'query' | 'body';
}

/**
 * Result of template analysis for a single operation.
 */
export interface TemplateAnalysis {
  /** List of substitutions that can be applied to the response */
  substitutions: TemplateSubstitution[];
  /** Whether any substitutions were found (convenience flag) */
  hasTemplating: boolean;
}

/**
 * Compute the path segment index for a given path parameter.
 *
 * Given a path like `/pets/{petId}/toys/{toyId}`, splits into segments
 * ["pets", "{petId}", "toys", "{toyId}"] and returns the 0-based index
 * of the segment matching the parameter name.
 *
 * @param path - OpenAPI path string (e.g. "/pets/{petId}")
 * @param paramName - Parameter name without braces (e.g. "petId")
 * @returns 0-based segment index, or -1 if not found
 */
export function getPathSegmentIndex(path: string, paramName: string): number {
  const segments = path.split('/').filter((s) => s.length > 0);
  return segments.findIndex((s) => s === `{${paramName}}`);
}

/**
 * Build a WireMock Handlebars expression for a path parameter.
 *
 * @param segmentIndex - 0-based index into path segments
 * @returns Expression like `{{request.pathSegments.[1]}}`
 */
export function buildPathParamExpression(segmentIndex: number): string {
  return `{{request.pathSegments.[${segmentIndex}]}}`;
}

/**
 * Build a WireMock Handlebars expression for a query parameter.
 *
 * @param paramName - Query parameter name
 * @returns Expression like `{{request.query.paramName}}`
 */
export function buildQueryParamExpression(paramName: string): string {
  return `{{request.query.${paramName}}}`;
}

/**
 * Build a WireMock Handlebars expression for a request body field.
 *
 * @param fieldName - JSON field name in the request body
 * @returns Expression like `{{jsonPath request.body '$.fieldName'}}`
 */
export function buildBodyFieldExpression(fieldName: string): string {
  // Use bracket notation for field names with special characters
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(fieldName)) {
    return `{{jsonPath request.body '$.${fieldName}'}}`;
  }
  return `{{jsonPath request.body '$['${fieldName}']'}}`;
}

/**
 * Analyse an operation record and determine which response fields can be
 * mapped to request data via WireMock response templating.
 *
 * Strategy:
 * 1. Path parameters → if the response schema has a field with the same name
 *    as a path param, substitute it with `{{request.pathSegments.[N]}}`
 * 2. Query parameters → if the response schema has a matching field name,
 *    substitute with `{{request.query.paramName}}`
 * 3. Request body fields → if both request and response schemas share a field
 *    name, substitute with `{{jsonPath request.body '$.field'}}`
 *
 * @param record - Operation record to analyse
 * @returns Template analysis with substitutions
 */
export function analyseTemplateSubstitutions(record: OperationRecord): TemplateAnalysis {
  const substitutions: TemplateSubstitution[] = [];
  const responseFields = extractResponseFieldNames(record.responseSchema);

  if (responseFields.size === 0) {
    return { substitutions, hasTemplating: false };
  }

  // 1. Path parameters
  for (const param of record.pathParams) {
    if (responseFields.has(param.name)) {
      const segmentIndex = getPathSegmentIndex(record.path, param.name);
      if (segmentIndex >= 0) {
        substitutions.push({
          field: param.name,
          expression: buildPathParamExpression(segmentIndex),
          source: 'path',
        });
      }
    }
  }

  // 2. Query parameters
  for (const param of record.queryParams) {
    if (responseFields.has(param.name) && !substitutions.some((s) => s.field === param.name)) {
      substitutions.push({
        field: param.name,
        expression: buildQueryParamExpression(param.name),
        source: 'query',
      });
    }
  }

  // 3. Request body fields
  const requestBodyFields = extractRequestBodyFieldNames(record.requestBodySchema);
  for (const fieldName of requestBodyFields) {
    if (responseFields.has(fieldName) && !substitutions.some((s) => s.field === fieldName)) {
      substitutions.push({
        field: fieldName,
        expression: buildBodyFieldExpression(fieldName),
        source: 'body',
      });
    }
  }

  return { substitutions, hasTemplating: substitutions.length > 0 };
}

/**
 * Apply template substitutions to a response body object.
 * Returns a JSON string with Handlebars placeholders instead of static values.
 *
 * Fields that have a substitution get the template expression as their value.
 * Fields without a substitution retain their original (faker-generated) value.
 *
 * @param body - The original response body (object with static/faker values)
 * @param substitutions - Template substitutions to apply
 * @returns JSON string with Handlebars template expressions
 */
export function applyTemplateSubstitutions(
  body: unknown,
  substitutions: TemplateSubstitution[],
): string {
  if (
    body === null ||
    body === undefined ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return JSON.stringify(body, null, 2);
  }

  const obj = body as Record<string, unknown>;
  const result: Record<string, unknown> = { ...obj };

  // Build a map of field → expression for quick lookup
  const subMap = new Map(substitutions.map((s) => [s.field, s.expression]));

  // Replace top-level fields that have substitutions with placeholder markers
  // We use a two-pass approach: first build JSON with placeholder strings,
  // then replace the quoted placeholders with unquoted template expressions
  const PLACEHOLDER_PREFIX = '__STW_TEMPLATE_';
  const placeholders: Map<string, string> = new Map();

  for (const [field, expression] of subMap) {
    if (field in result) {
      const placeholder = `${PLACEHOLDER_PREFIX}${field}__`;
      result[field] = placeholder;
      placeholders.set(`"${placeholder}"`, expression);
    }
  }

  let json = JSON.stringify(result, null, 2);

  // Replace the quoted placeholders with raw template expressions
  for (const [quoted, expression] of placeholders) {
    json = json.replace(quoted, `"${expression}"`);
  }

  return json;
}

/**
 * Extract top-level field names from a JSON schema's `properties` object.
 * @param schema - Response JSON schema (or undefined/null)
 * @returns Set of field names
 */
function extractResponseFieldNames(schema: unknown): Set<string> {
  const fields = new Set<string>();

  if (!schema || typeof schema !== 'object') return fields;

  const schemaObj = schema as Record<string, unknown>;

  // Direct properties
  if (schemaObj.properties && typeof schemaObj.properties === 'object') {
    for (const key of Object.keys(schemaObj.properties as object)) {
      fields.add(key);
    }
  }

  // allOf — merge properties from all sub-schemas
  if (Array.isArray(schemaObj.allOf)) {
    for (const sub of schemaObj.allOf) {
      const subFields = extractResponseFieldNames(sub);
      for (const f of subFields) fields.add(f);
    }
  }

  return fields;
}

/**
 * Extract top-level field names from a request body schema.
 * @param schema - Request body JSON schema (or undefined)
 * @returns Set of field names
 */
function extractRequestBodyFieldNames(schema: unknown): Set<string> {
  return extractResponseFieldNames(schema); // same logic
}
