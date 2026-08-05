/**
 * @file Load OpenAPI spec from file (JSON/YAML)
 * @description Handles file I/O and format detection for OpenAPI specs
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { ParserError } from '../errors/parser-error.js';

/**
 * Load OpenAPI spec from file, auto-detecting JSON vs YAML format
 * @param filePath - Path to spec file (relative or absolute)
 * @returns Parsed spec as object
 * @throws ParserError if file cannot be read or parsed
 */
export function loadSpecFromFile(filePath: string): Record<string, unknown> {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Detect format by extension or content
    const extension = filePath.toLowerCase().endsWith('.yaml') ||
      filePath.toLowerCase().endsWith('.yml');

    if (extension) {
      return yaml.load(content) as Record<string, unknown>;
    }

    // Try JSON first
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      // Fall back to YAML if JSON fails
      return yaml.load(content) as Record<string, unknown>;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Distinguish file I/O errors from parsing errors
    if (message.includes('ENOENT') || message.includes('not found')) {
      throw new ParserError('INVALID_FILE', `File not found: ${filePath}`, {
        filePath,
      });
    }

    if (message.includes('EACCES') || message.includes('Permission denied')) {
      throw new ParserError('INVALID_FILE', `Permission denied reading: ${filePath}`, {
        filePath,
      });
    }

    throw new ParserError('PARSE_ERROR', `Failed to parse spec file: ${message}`, {
      filePath,
      originalError: message,
    });
  }
}
