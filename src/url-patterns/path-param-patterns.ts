/**
 * @file Path parameter to regex pattern mappings
 * @description Maps OpenAPI schema type/format to WireMock regex patterns
 */

/**
 * Regex patterns for path parameters by type and format
 * Used when converting OpenAPI path parameters to WireMock URL patterns
 */
export const PATH_PARAM_PATTERNS: Record<string, string> = {
  // Specific formats
  'string:uuid': '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  'string:date': '\\d{4}-\\d{2}-\\d{2}',
  'string:date-time': '\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}.*',
  'string:email': '[^/]+@[^/]+\\.[^/]+',

  // Basic types
  'integer': '[0-9]+',
  'integer:int32': '[0-9]+',
  'integer:int64': '[0-9]+',
  'number': '[-]?[0-9]*\\.?[0-9]+',
  'number:float': '[-]?[0-9]*\\.?[0-9]+',
  'number:double': '[-]?[0-9]*\\.?[0-9]+',
  'boolean': '(true|false)',

  // Default (any string without slashes)
  'string': '[^/]+',
};

/**
 * Get regex pattern for a parameter by type and format
 * @param type - Parameter type (string, integer, number, boolean)
 * @param format - Parameter format (uuid, date, email, etc.)
 * @returns Regex pattern for matching this parameter value in URL
 */
export function getPathParamPattern(type?: string, format?: string): string {
  // Default to string if no type provided
  if (!type) {
    return PATH_PARAM_PATTERNS['string']!;
  }

  // Try format-specific pattern first
  if (format) {
    const key = type + ':' + format;
    const pattern = PATH_PARAM_PATTERNS[key as keyof typeof PATH_PARAM_PATTERNS];
    if (pattern !== undefined) {
      return pattern;
    }
  }

  // Fall back to type-only pattern
  const typePattern = PATH_PARAM_PATTERNS[type as keyof typeof PATH_PARAM_PATTERNS];
  if (typePattern !== undefined) {
    return typePattern;
  }

  // Default to generic string pattern
  return PATH_PARAM_PATTERNS['string']!;
}
