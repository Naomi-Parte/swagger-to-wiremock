/**
 * @file Detect Swagger 2.0 specs
 * @description Single-responsibility check for whether a raw parsed spec is Swagger 2.0
 */

/**
 * Determine whether a raw parsed spec is Swagger 2.0
 * @param spec - Raw spec object as loaded from disk (JSON or YAML)
 * @returns true if the spec declares `swagger: "2.0"`
 */
export function isSwagger2(spec: unknown): boolean {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'swagger' in spec &&
    (spec as Record<string, unknown>).swagger === '2.0'
  );
}
