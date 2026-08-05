/**
 * @file Parser-specific error class
 * @description Handles errors related to OpenAPI spec parsing and validation
 */

import { BaseError } from './base-error.js';

/**
 * Error type for parser failures
 * @extends BaseError
 */
export class ParserError extends BaseError {
  constructor(
    code: 'INVALID_FILE' | 'INVALID_SPEC' | 'UNSUPPORTED_VERSION' | 'CIRCULAR_REF' | 'PARSE_ERROR',
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(code, message, context);
    Object.setPrototypeOf(this, ParserError.prototype);
  }
}
