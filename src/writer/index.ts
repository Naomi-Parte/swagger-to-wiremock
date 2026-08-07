/**
 * @file WireMock file writer
 * @description Writes generated mappings and response bodies to WireMock directory structure
 */

import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import type { WireMockMapping } from '../types/wiremock-mapping.js';
import type { OperationRecord } from '../types/operation-record.js';
import { generateResponseBody } from '../generator/response-builder.js';
import { createPlaceholderBody } from '../filters/placeholder-generator.js';
import { getStatusClass } from '../filters/status-classifier.js';

export interface WriteOptions {
  /** Output root directory (default: './wiremock') */
  outputDir: string;
  /** Delete output directory before writing (default: false) */
  clean?: boolean;
  /** Print what would be written without actually writing (default: false) */
  dryRun?: boolean;
  /** Seed used for deterministic response body generation (default: 42) */
  seed?: number;
  /** Write TODO placeholder response bodies instead of real ones (default: false) */
  empty?: boolean;
  /** Write everything to a single mappings/__files folder pair instead of splitting by status class (default: false) */
  flat?: boolean;
  /** When split (not flat), also write an `all/` folder containing every mapping (default: true) */
  includeAllFolder?: boolean;
}

export interface WriteResult {
  /** Paths of mapping files written */
  mappingFiles: string[];
  /** Paths of body files written */
  bodyFiles: string[];
  /** Total bytes written */
  totalBytes: number;
  /** Number of stubs written per folder (e.g. { "2xx": 3, "5xx": 3, "all": 6 }). Only set in split mode. */
  folderCounts?: Record<string, number>;
}

interface WriteItem {
  mapping: WireMockMapping;
  record: OperationRecord;
  bodyFileName: string;
}

/**
 * Build the response body content for a single item.
 * @param record - Operation record the body belongs to
 * @param empty - When true, always use the TODO placeholder body
 * @param seed - Seed used for deterministic response body generation
 * @returns Body content (object or string)
 */
function buildBody(record: OperationRecord, empty: boolean, seed: number): unknown {
  if (empty) {
    return {
      TODO: `Add response body for ${record.method.toUpperCase()} ${record.path} → ${record.statusCode}`,
    };
  }

  return record.responseSchema || record.responseExample
    ? generateResponseBody(record, seed)
    : createPlaceholderBody(record.method, record.path, Number(record.statusCode));
}

/**
 * Write a set of mapping + body file pairs into a given mappings/__files directory pair.
 * @param items - Mapping + record pairs to write
 * @param mappingsDir - Directory to write mapping JSON files to
 * @param filesDir - Directory to write response body files to
 * @param dryRun - When true, log what would be written without touching disk
 * @param empty - When true, write TODO placeholder bodies instead of real ones
 * @param seed - Seed used for deterministic response body generation
 * @returns Paths written and total byte count for this directory pair
 */
async function writeItemsToDir(
  items: WriteItem[],
  mappingsDir: string,
  filesDir: string,
  dryRun: boolean,
  empty: boolean,
  seed: number,
): Promise<{ mappingFiles: string[]; bodyFiles: string[]; totalBytes: number }> {
  if (!dryRun) {
    await mkdir(mappingsDir, { recursive: true });
    await mkdir(filesDir, { recursive: true });
  }

  const mappingFiles: string[] = [];
  const bodyFiles: string[] = [];
  let totalBytes = 0;

  for (const item of items) {
    const mappingPath = join(mappingsDir, item.bodyFileName);
    const bodyPath = join(filesDir, item.bodyFileName);

    const mappingContent = `${JSON.stringify(item.mapping, null, 2)}\n`;
    const body = buildBody(item.record, empty, seed);
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

  return { mappingFiles, bodyFiles, totalBytes };
}

/**
 * Write WireMock mappings and body files to disk.
 *
 * By default, output is split into per-status-class folders (`2xx/`, `4xx/`, `5xx/`, ...)
 * plus an `all/` folder containing every mapping, so each folder is independently loadable
 * by WireMock. Pass `flat: true` to write everything into a single `mappings/`/`__files/`
 * pair instead (the pre-split behaviour).
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
  const empty = options.empty ?? false;
  const flat = options.flat ?? false;
  const includeAllFolder = options.includeAllFolder ?? true;

  if (clean && !dryRun) {
    await rm(outputDir, { recursive: true, force: true });
  }

  const items: WriteItem[] = mappings
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

  if (flat) {
    const mappingsDir = join(outputDir, 'mappings');
    const filesDir = join(outputDir, '__files');
    return writeItemsToDir(items, mappingsDir, filesDir, dryRun, empty, seed);
  }

  // Split mode: group items by status class, writing each into its own folder.
  const groups = new Map<string, WriteItem[]>();
  for (const item of items) {
    const cls = getStatusClass(item.record.statusCode);
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(item);
  }

  const mappingFiles: string[] = [];
  const bodyFiles: string[] = [];
  let totalBytes = 0;
  const folderCounts: Record<string, number> = {};

  const sortedClasses = Array.from(groups.keys()).sort();

  for (const cls of sortedClasses) {
    const classItems = groups.get(cls)!;
    const mappingsDir = join(outputDir, cls, 'mappings');
    const filesDir = join(outputDir, cls, '__files');
    const result = await writeItemsToDir(classItems, mappingsDir, filesDir, dryRun, empty, seed);

    mappingFiles.push(...result.mappingFiles);
    bodyFiles.push(...result.bodyFiles);
    totalBytes += result.totalBytes;
    folderCounts[cls] = classItems.length;
  }

  if (includeAllFolder) {
    const mappingsDir = join(outputDir, 'all', 'mappings');
    const filesDir = join(outputDir, 'all', '__files');
    const result = await writeItemsToDir(items, mappingsDir, filesDir, dryRun, empty, seed);

    mappingFiles.push(...result.mappingFiles);
    bodyFiles.push(...result.bodyFiles);
    totalBytes += result.totalBytes;
    folderCounts.all = items.length;
  }

  return {
    mappingFiles,
    bodyFiles,
    totalBytes,
    folderCounts,
  };
}
