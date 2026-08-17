/**
 * @file Stub server generator
 * @description Creates a minimal catch-all WireMock mapping for a given status code.
 *              Used by `stw serve --stub <code>` to spin up a server without a spec file.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

/**
 * HTTP reason phrases for common status codes
 */
const REASON_PHRASES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * Get the reason phrase for a status code, or a generic one based on class.
 */
function getReasonPhrase(status: number): string {
  if (REASON_PHRASES[status]) return REASON_PHRASES[status]!;
  if (status >= 200 && status < 300) return 'Success';
  if (status >= 300 && status < 400) return 'Redirect';
  if (status >= 400 && status < 500) return 'Client Error';
  if (status >= 500 && status < 600) return 'Server Error';
  return 'Unknown';
}

/**
 * Build a response body appropriate for the given status code.
 */
function buildResponseBody(status: number): Record<string, unknown> {
  if (status >= 200 && status < 300) {
    return { status: getReasonPhrase(status) };
  }
  return {
    error: getReasonPhrase(status),
    status,
  };
}

/**
 * Generate a UUID v4
 */
function generateId(): string {
  const buffer = randomBytes(16);
  const buf = buffer as unknown as number[];
  buffer[6] = ((buffer[6] ?? 0) & 0x0f) | 0x40;
  buffer[8] = ((buffer[8] ?? 0) & 0x3f) | 0x80;

  const hex = buffer.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Create a temporary WireMock root directory with a single catch-all stub
 * that responds with the given status code to any request.
 *
 * @param status - HTTP status code to return
 * @returns Path to the temporary root directory (contains mappings/ and __files/)
 */
export function createStubServerDir(status: number): string {
  // Create temp directory
  const dirName = `stw-stub-${status}-${Date.now()}`;
  const rootDir = join(tmpdir(), dirName);
  const mappingsDir = join(rootDir, 'mappings');
  const filesDir = join(rootDir, '__files');

  mkdirSync(mappingsDir, { recursive: true });
  mkdirSync(filesDir, { recursive: true });

  const responseBody = buildResponseBody(status);

  const mapping = {
    id: generateId(),
    name: `Catch-all stub - ${status}`,
    priority: 999,
    request: {
      method: 'ANY',
      urlPattern: '.*',
    },
    response: {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
      jsonBody: responseBody,
    },
  };

  const mappingPath = join(mappingsDir, `catch-all-${status}.json`);
  writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`, 'utf8');

  return rootDir;
}
