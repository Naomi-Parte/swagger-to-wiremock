/**
 * @file Server base path extractor
 * @description Extracts the path component from OpenAPI servers[].url,
 *   handling server variables (strip by default, regex with --include-server-variables).
 */

/**
 * Result of server base path extraction
 */
export interface ServerPathResult {
  /** Extracted base path (e.g. "/msd/obligations/v1") or empty string if none */
  basePath: string;
  /** True if the original URL contained server variables */
  hasVariables: boolean;
  /** Names of variables found in the server URL path */
  variableNames: string[];
  /** 'exact' if no variables in output, 'regex' if variables converted to patterns */
  strategy: 'exact' | 'regex';
}

/**
 * Options for server path extraction
 */
export interface ExtractServerPathOptions {
  /** Which servers[] entry to use (default: 0) */
  serverIndex?: number;
  /** If true, replace {variables} with [^/]+ regex; if false, strip them (default: false) */
  includeVariables?: boolean;
}

/**
 * Extract the base path from an OpenAPI spec's servers[] array.
 *
 * Default behaviour: variable segments like {subenv} are stripped from the path.
 *   e.g. https://host/{subenv}/msd/obligations/v1 → /msd/obligations/v1
 *
 * With includeVariables=true: variable segments become [^/]+ regex.
 *   e.g. https://host/{subenv}/msd/obligations/v1 → /[^/]+/msd/obligations/v1
 *
 * @param spec - Dereferenced OpenAPI spec object
 * @param options - Extraction options
 * @returns ServerPathResult with base path and metadata
 */
export function extractServerBasePath(
  spec: Record<string, unknown>,
  options: ExtractServerPathOptions = {},
): ServerPathResult {
  const { serverIndex = 0, includeVariables = false } = options;

  const emptyResult: ServerPathResult = {
    basePath: '',
    hasVariables: false,
    variableNames: [],
    strategy: 'exact',
  };

  // Get servers array
  const servers = spec.servers as Array<Record<string, unknown>> | undefined;
  if (!servers || !Array.isArray(servers) || servers.length === 0) {
    return emptyResult;
  }

  // Validate server index
  const server = servers[serverIndex];
  if (!server) {
    return emptyResult;
  }

  const url = server.url as string | undefined;
  if (!url || typeof url !== 'string') {
    return emptyResult;
  }

  // Extract path from URL
  const pathname = extractPathname(url);
  if (!pathname || pathname === '/') {
    return emptyResult;
  }

  // Find all variable placeholders in the path
  const variableNames = extractVariableNames(pathname);
  const hasVariables = variableNames.length > 0;

  if (!hasVariables) {
    // No variables — return path as-is (strip trailing slash)
    return {
      basePath: normalizeBasePath(pathname),
      hasVariables: false,
      variableNames: [],
      strategy: 'exact',
    };
  }

  if (includeVariables) {
    // Replace {var} with [^/]+ regex pattern
    const regexPath = pathname.replace(/\{[^}]+\}/g, '[^/]+');
    return {
      basePath: normalizeBasePath(regexPath),
      hasVariables: true,
      variableNames,
      strategy: 'regex',
    };
  }

  // Default: strip variable segments from path
  const strippedPath = stripVariableSegments(pathname);
  return {
    basePath: normalizeBasePath(strippedPath),
    hasVariables: true,
    variableNames,
    strategy: 'exact',
  };
}

/**
 * Extract the pathname from a URL string.
 * Handles both absolute URLs (https://host/path) and relative URLs (/path).
 */
function extractPathname(url: string): string {
  // Handle relative URLs (just a path)
  if (url.startsWith('/')) {
    return url;
  }

  try {
    // For absolute URLs, use URL parsing
    // Replace {vars} temporarily to avoid URL parse errors
    const sanitized = url.replace(/\{[^}]+\}/g, '__var__');
    const parsed = new URL(sanitized);
    // Restore variables
    let pathname = parsed.pathname;
    const varMatches = url.match(/\{[^}]+\}/g) || [];
    let varIndex = 0;
    pathname = pathname.replace(/__var__/g, () => varMatches[varIndex++] || '__var__');
    return pathname;
  } catch {
    // If URL parsing fails, try to extract path manually
    // Remove protocol + host: everything after the third slash
    const withoutProtocol = url.replace(/^[a-z]+:\/\//, '');
    const slashIndex = withoutProtocol.indexOf('/');
    if (slashIndex === -1) return '/';
    return withoutProtocol.slice(slashIndex);
  }
}

/**
 * Extract variable names from a path string.
 * @param path - Path potentially containing {variable} placeholders
 * @returns Array of variable names (without braces)
 */
function extractVariableNames(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Strip variable segments from a path.
 * A "variable segment" is a path segment that is entirely a variable (e.g. /{subenv}/).
 * Segments that mix static text and variables (e.g. /v{version}/) are kept with
 * the variable portion removed.
 *
 * Examples:
 *   /{subenv}/msd/obligations/v1 → /msd/obligations/v1
 *   /{a}/{b}/rest → /rest
 *   /api/v{version}/users → /api/v/users
 */
function stripVariableSegments(path: string): string {
  const segments = path.split('/');
  const result: string[] = [];

  for (const segment of segments) {
    if (segment === '') {
      // Preserve empty segments from leading/consecutive slashes
      result.push(segment);
      continue;
    }

    // Check if entire segment is a single variable
    if (/^\{[^}]+\}$/.test(segment)) {
      // Skip entirely-variable segments
      continue;
    }

    // For mixed segments, remove variable portions
    const cleaned = segment.replace(/\{[^}]+\}/g, '');
    if (cleaned) {
      result.push(cleaned);
    }
  }

  // Join and ensure leading slash
  const joined = result.join('/');
  if (!joined.startsWith('/')) {
    return '/' + joined;
  }
  return joined;
}

/**
 * Normalize base path: strip trailing slash, ensure leading slash.
 * Returns empty string if path is effectively root.
 */
function normalizeBasePath(path: string): string {
  // Strip trailing slash
  let normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  // Ensure leading slash
  if (normalized && !normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  // If just '/', return empty
  if (normalized === '/') return '';
  return normalized;
}
