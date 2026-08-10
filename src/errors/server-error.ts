/**
 * @file Server-specific error class
 * @description Handles errors related to WireMock server lifecycle (JAR not found, Java missing, etc.)
 */

import { BaseError } from './base-error.js';

/**
 * Error type for server failures
 * @extends BaseError
 */
export class ServerError extends BaseError {
  constructor(
    code: 'JAR_NOT_FOUND' | 'JAVA_NOT_FOUND' | 'SERVER_START_FAILED' | 'INVALID_STUBS_DIR',
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(code, message, context);
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}
