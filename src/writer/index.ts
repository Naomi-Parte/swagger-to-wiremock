/**
 * @file WireMock file writer
 * @description Writes generated mappings and response bodies to WireMock directory structure
 */

import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import type { WireMockMapping } from '../types/wiremock-mapping.js';
import type { OperationRecord } from '../types/operation-record.js';
import { generateResponseBody } from '../generator/response-builder.js';

export interface WriteOptions {
  /** Output root directory (default: './wiremock') */
  outputDir: string;
  /** Delete output directory before writing (default: false) */
  clean?: boolean;
  /** Print what would be written without actually writing (default: false) */
  dryRun?: boolean;
  /** Seed used for deterministic response body generation (default: 42) */
  seed?: number;
}

export interface WriteResult {
  /** Paths of mapping files written */
  mappingFiles: string[];
  /** Paths of body files written */
  bodyFiles: string[];
  /** Total bytes written */
  totalBytes: number;
}

/**
 * Write WireMock mappings and body files to disk.
 * @param mappings - Generated WireMock mappings
 * @param records - Source operation records, index-aligned with mappings
 * @param options - Writer options
 * @returns Paths written and total byte count
 */
export async function writeStubs(
  mappings: WireMockMapping[],
  records: OperationRecord[],
  options: WriteOptions,
): Promise<WriteResult> {
  const outputDir = options.outputDir ?? './wiremock';
  const clean = options.clean ?? false;
  const dryRun = options.dryRun ?? false;
  const seed = options.seed ?? 42;

  if (clean && !dryRun) {
    await rm(outputDir, { recursive: true, force: true });
  }

  const mappingsDir = join(outputDir, 'mappings');
  const filesDir = join(outputDir, '__files');

  if (!dryRun) {
    await mkdir(mappingsDir, { recursive: true });
    await mkdir(filesDir, { recursive: true });
  }

  const items = mappings
    .map((mapping, index) => {
      const bodyFileName = mapping.response.bodyFileName;
      if (!bodyFileName) {
        throw new Error(`Mapping "${mapping.name}" is missing response.bodyFileName`);
      }

      const record = records[index];
      if (!record) {
        throw new Error(`No operation record found for mapping index ${index}`);
      }

      return { mapping, record, bodyFileName };
    })
    .sort((a, b) => a.bodyFileName.localeCompare(b.bodyFileName));

  const mappingFiles: string[] = [];
  const bodyFiles: string[] = [];
  let totalBytes = 0;

  for (const item of items) {
    const mappingPath = join(mappingsDir, item.bodyFileName);
    const bodyPath = join(filesDir, item.bodyFileName);

    const mappingContent = `${JSON.stringify(item.mapping, null, 2)}\n`;
    const body = generateResponseBody(item.record, seed);
    const bodyContent = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;

    mappingFiles.push(mappingPath);
    bodyFiles.push(bodyPath);
    totalBytes += Buffer.byteLength(mappingContent, 'utf8');
    totalBytes += Buffer.byteLength(bodyContent, 'utf8');

    if (dryRun) {
      console.log(`[dry-run] would write mapping: ${mappingPath}`);
      console.log(`[dry-run] would write body: ${bodyPath}`);
      continue;
    }

    await writeFile(mappingPath, mappingContent, 'utf8');
    await writeFile(bodyPath, bodyContent, 'utf8');
  }

  return {
    mappingFiles,
    bodyFiles,
    totalBytes,
  };
}
