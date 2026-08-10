/**
 * @file Extract security requirements from OpenAPI spec
 * @description Resolves security schemes applied to operations and produces
 *   SecurityMatcher descriptors used by the generator to add header/query matchers.
 *
 * Supported scheme types:
 *   - http (bearer, basic) → Authorization header matcher
 *   - apiKey (header) → named header matcher
 *   - apiKey (query) → query parameter matcher
 *   - oauth2 → Authorization header matcher (presence check)
 *   - openIdConnect → Authorization header matcher (presence check)
 *   - mutualTLS → skipped (transport-layer, no request matcher)
 */

/**
 * Describes a security matcher to apply on a WireMock request
 */
export interface SecurityMatcher {
  /** Where the credential appears: header or query */
  in: 'header' | 'query';

  /** Header or query parameter name */
  name: string;

  /** Regex pattern to match the credential value */
  pattern: string;

  /** Human-readable description of the scheme */
  description: string;
}

/**
 * OpenAPI security scheme definition (subset we care about)
 */
interface SecuritySchemeObject {
  type: string;
  scheme?: string;
  name?: string;
  in?: string;
  bearerFormat?: string;
}

/**
 * Extract security matchers for an operation.
 *
 * Resolution order:
 * 1. Operation-level `security` array (if present, overrides global)
 * 2. Top-level `security` array (global default)
 *
 * If an operation sets `security: []` (empty array), it explicitly has no security.
 *
 * @param spec - Full dereferenced OpenAPI spec
 * @param operation - The operation object
 * @returns Array of SecurityMatcher (may be empty for no auth or unsupported schemes)
 */
export function extractSecurityMatchers(
  spec: Record<string, unknown>,
  operation: Record<string, unknown>,
): SecurityMatcher[] {
  // Determine which security requirements apply
  const operationSecurity = operation.security as Array<Record<string, string[]>> | undefined;
  const globalSecurity = spec.security as Array<Record<string, string[]>> | undefined;

  // Operation-level overrides global (including empty array = no security)
  const securityRequirements = operationSecurity !== undefined ? operationSecurity : globalSecurity;

  if (!securityRequirements || securityRequirements.length === 0) {
    return [];
  }

  // Get security schemes from components
  const components = spec.components as Record<string, unknown> | undefined;
  const securitySchemes = components?.securitySchemes as Record<string, SecuritySchemeObject> | undefined;

  if (!securitySchemes) return [];

  const matchers: SecurityMatcher[] = [];
  const seenNames = new Set<string>();

  // Process each security requirement object
  // Each object can reference multiple schemes (AND logic)
  // Multiple objects in the array represent OR alternatives — we use the first one
  const firstRequirement = securityRequirements[0];
  if (!firstRequirement) return [];

  for (const schemeName of Object.keys(firstRequirement)) {
    const scheme = securitySchemes[schemeName];
    if (!scheme) continue;

    const matcher = buildMatcherForScheme(scheme, schemeName);
    if (matcher && !seenNames.has(matcher.name)) {
      matchers.push(matcher);
      seenNames.add(matcher.name);
    }
  }

  return matchers;
}

/**
 * Build a SecurityMatcher for a given security scheme.
 * Returns undefined for unsupported schemes (mutualTLS, etc.)
 */
function buildMatcherForScheme(
  scheme: SecuritySchemeObject,
  schemeName: string,
): SecurityMatcher | undefined {
  switch (scheme.type) {
    case 'http':
      return buildHttpSchemeMatcher(scheme, schemeName);

    case 'apiKey':
      return buildApiKeySchemeMatcher(scheme, schemeName);

    case 'oauth2':
      return {
        in: 'header',
        name: 'Authorization',
        pattern: 'Bearer .+',
        description: `OAuth2 (${schemeName})`,
      };

    case 'openIdConnect':
      return {
        in: 'header',
        name: 'Authorization',
        pattern: 'Bearer .+',
        description: `OpenID Connect (${schemeName})`,
      };

    case 'mutualTLS':
      // mTLS is transport-layer — no request header/query to match
      return undefined;

    default:
      // Unknown scheme type — skip gracefully
      return undefined;
  }
}

/**
 * Build matcher for HTTP auth schemes (bearer, basic, digest, etc.)
 */
function buildHttpSchemeMatcher(
  scheme: SecuritySchemeObject,
  schemeName: string,
): SecurityMatcher {
  const httpScheme = (scheme.scheme ?? '').toLowerCase();

  switch (httpScheme) {
    case 'bearer':
      return {
        in: 'header',
        name: 'Authorization',
        pattern: 'Bearer .+',
        description: `Bearer token (${schemeName})`,
      };

    case 'basic':
      return {
        in: 'header',
        name: 'Authorization',
        pattern: 'Basic .+',
        description: `Basic auth (${schemeName})`,
      };

    default:
      // Other HTTP schemes (digest, hoba, etc.) — match any Authorization value
      return {
        in: 'header',
        name: 'Authorization',
        pattern: '.+',
        description: `HTTP ${httpScheme} auth (${schemeName})`,
      };
  }
}

/**
 * Build matcher for API key schemes (header or query parameter)
 */
function buildApiKeySchemeMatcher(
  scheme: SecuritySchemeObject,
  schemeName: string,
): SecurityMatcher | undefined {
  const keyName = scheme.name;
  const location = scheme.in;

  if (!keyName || !location) return undefined;

  if (location === 'header') {
    return {
      in: 'header',
      name: keyName,
      pattern: '.+',
      description: `API key header (${schemeName})`,
    };
  }

  if (location === 'query') {
    return {
      in: 'query',
      name: keyName,
      pattern: '.+',
      description: `API key query param (${schemeName})`,
    };
  }

  // "cookie" location — not supported by WireMock request matchers
  return undefined;
}
