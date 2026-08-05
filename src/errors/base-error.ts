/**
 * @file Base error class for custom errors
 * @description Provides consistent error handling with typed error codes
 */

/**
 * Base class for all custom errors in the application
 * @description Extends Error with typed error code and context
 */
export class BaseError extends Error {
  /**
   * @param code - Machine-readable error code (e.g., 'PARSE_ERROR')
   * @param message - Human-readable error message
   * @param context - Additional diagnostic context (optional)
   */
  constructor(
    readonly code: string,
    message: string,
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, BaseError.prototype);
  }

  /**
   * Get full error details including code and context
   * @returns Object with code, message, and context
   */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      name: this.name,
      context: this.context,
    };
  }
}
