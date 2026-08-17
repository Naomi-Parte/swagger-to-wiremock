/**
 * @file WireMock file writer
 * @description Writes generated mappings and response bodies to WireMock directory structure
 */

import { mkdir, rm, writeFile, access } from 'fs/promises';
import { join } from 'path';
import type { WireMockMapping } from '../types/wiremock-mapping.js';
import type { OperationRecord } from '../types/operation-record.js';
import { generateResponseBody } from '../generator/response-builder.js';
import { createPlaceholderBody } from '../filters/placeholder-generator.js';
import { getStatusClass } from '../filters/status-classifier.js';
import { applyTemplateSubstitutions } from '../generator/template-builder.js';
import type { TemplateSubstitution } from '../generator/template-builder.js';

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
}

export interface WriteResult {
  /** Paths of mapping files written */
  mappingFiles: string[];
  /** Paths of body files written */
  bodyFiles: string[];
  /** Total bytes written */
  totalBytes: number;
  /** Number of stubs written per folder (e.g. { "2xx": 3, "5xx": 3 }). Only set in split mode. */
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

    const body = buildBody(item.record, empty, seed);

    // Apply template substitutions if present (from --templated mode)
    const templateSubs = (item.mapping.response as unknown as Record<string, unknown>)['_templateSubstitutions'] as
      | TemplateSubstitution[]
      | undefined;

    let bodyContent: string;
    if (templateSubs && templateSubs.length > 0) {
      bodyContent = `${applyTemplateSubstitutions(body, templateSubs)}\n`;
    } else {
      bodyContent = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
    }

    // Strip internal metadata before writing the mapping file
    const mappingToWrite = { ...item.mapping, response: { ...item.mapping.response } };
    delete (mappingToWrite.response as unknown as Record<string, unknown>)['_templateSubstitutions'];
    const mappingContent = `${JSON.stringify(mappingToWrite, null, 2)}\n`;

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
 * Safely clean only stw-generated artifacts from the output directory.
 * Removes only known stw folders: mappings/, __files/, and status-class folders (1xx/-5xx/).
 * Does NOT delete the output directory itself or any other files within it.
 *
 * @param outputDir - Root output directory
 * @param flat - Whether flat mode is being used
 */
async function cleanStwArtifacts(outputDir: string, flat: boolean): Promise<void> {
  // Folders that stw generates — only these are safe to delete
  const stwFolders = flat
    ? ['mappings', '__files']
    : ['mappings', '__files', '1xx', '2xx', '3xx', '4xx', '5xx'];

  for (const folder of stwFolders) {
    const target = join(outputDir, folder);
    try {
      await access(target);
      await rm(target, { recursive: true, force: true });
    } catch {
      // Folder doesn't exist — skip silently
    }
  }
}

/**
 * Write WireMock mappings and body files to disk.
 *
 * By default, output is split into per-status-class folders (`2xx/`, `4xx/`, `5xx/`, ...)
 * so each folder is independently loadable by WireMock. Pass `flat: true` to write
 * everything into a single `mappings/`/`__files/` pair instead (the pre-split behaviour).
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

  if (clean && !dryRun) {
    await cleanStwArtifacts(outputDir, flat);
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

  return {
    mappingFiles,
    bodyFiles,
    totalBytes,
    folderCounts,
  };
}
