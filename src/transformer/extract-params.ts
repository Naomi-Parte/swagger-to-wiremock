/**
 * @file Extract parameters from OpenAPI operation
 * @description Extracts path, query, and header parameters from operation definition
 */

/**
 * Extracted parameter information
 */
export interface ExtractedParam {
  name: string;
  type?: string;
  format?: string;
  required: boolean;
  enum?: (string | number)[];
  pattern?: string;
}

/**
 * Extract path parameters from OpenAPI path template
 * @param path - OpenAPI path template (e.g., "/pets/{petId}")
 * @returns Array of parameter names (e.g., ["petId"])
 *
 * @example
 * ```typescript
 * extractPathParamNames("/pets/{petId}") // ["petId"]
 * extractPathParamNames("/orgs/{orgId}/members/{memberId}") // ["orgId", "memberId"]
 * ```
 */
export function extractPathParamNames(path: string): string[] {
  const matches = path.match(/{([^}]+)}/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

/**
 * Get parameter schema details
 * @param parameter - OpenAPI parameter object
 * @returns Extracted parameter info
 */
function getParameterSchema(parameter: Record<string, unknown>): Omit<ExtractedParam, 'name'> {
  const schema = parameter.schema as Record<string, unknown> | undefined;

  return {
    type: (schema?.type ?? parameter.type) as string | undefined,
    format: schema?.format as string | undefined,
    required: parameter.required === true,
    enum: schema?.enum as (string | number)[] | undefined,
    pattern: schema?.pattern as string | undefined,
  };
}

/**
 * Extract parameters from OpenAPI operation
 * @param operation - OpenAPI operation object (get/post/put/etc)
 * @param pathParamNames - Expected path param names for this path
 * @returns Object with path, query, and header parameters
 */
export function extractOperationParams(
  operation: Record<string, unknown>,
  pathParamNames: string[],
): {
  pathParams: ExtractedParam[];
  queryParams: ExtractedParam[];
  headers: ExtractedParam[];
} {
  const pathParams: ExtractedParam[] = [];
  const queryParams: ExtractedParam[] = [];
  const headers: ExtractedParam[] = [];

  const parameters = operation.parameters as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(parameters)) {
    return { pathParams, queryParams, headers };
  }

  parameters.forEach((param) => {
    const name = param.name as string | undefined;
    if (!name) return;

    const schema = getParameterSchema(param);

    switch (param.in) {
      case 'path':
        pathParams.push({ name, ...schema });
        break;
      case 'query':
        queryParams.push({ name, ...schema });
        break;
      case 'header':
        headers.push({ name, ...schema });
        break;
    }
  });

  // Ensure all path params are included even if not explicitly listed
  pathParamNames.forEach((paramName) => {
    if (!pathParams.some((p) => p.name === paramName)) {
      pathParams.push({ name: paramName, required: true });
    }
  });

  return { pathParams, queryParams, headers };
}
