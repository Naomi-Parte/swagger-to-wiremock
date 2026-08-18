/**
 * @file Session logger for WireMock serve sessions
 * @description Creates per-session log files with timestamped, flushed output.
 *   Captures all WireMock stdout/stderr including request/response traffic.
 */

import { createWriteStream, mkdirSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { WriteStream } from 'fs';

/**
 * Generate the log filename for a session.
 * Format: stw-<port>-<YYYYMMDD>-<HHmmss>.log
 */
export function generateLogFilename(port: number): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `stw-${port}-${date}-${time}.log`;
}

/**
 * Resolve the log directory from config or default.
 * Resolution: explicit logDir > ~/.swagger-to-wiremock/logs/
 */
export function resolveLogDir(logDir: string | undefined): string {
  if (logDir) {
    return resolve(logDir);
  }
  return join(homedir(), '.swagger-to-wiremock', 'logs');
}

export interface SessionLoggerOptions {
  /** Port the server runs on */
  port: number;
  /** Root directory being served */
  rootDir: string;
  /** Explicit log directory (if configured) */
  logDir?: string;
  /** PID of the WireMock process */
  pid?: number;
  /** JAR path used */
  jarPath?: string;
}

/**
 * Per-session logger that writes timestamped lines to a log file.
 * All writes are flushed immediately (no buffering).
 */
export class SessionLogger {
  private stream: WriteStream;
  private _logFilePath: string;
  private _logDirPath: string;

  constructor(options: SessionLoggerOptions) {
    const { port, rootDir, logDir, pid, jarPath } = options;

    this._logDirPath = resolveLogDir(logDir);

    // Ensure log directory exists
    if (!existsSync(this._logDirPath)) {
      mkdirSync(this._logDirPath, { recursive: true });
    }

    const filename = generateLogFilename(port);
    this._logFilePath = join(this._logDirPath, filename);

    // Open write stream with autoClose and flush-on-write (no highWaterMark buffering)
    this.stream = createWriteStream(this._logFilePath, {
      flags: 'a',
      encoding: 'utf8',
      // Low highWaterMark to flush frequently
      highWaterMark: 0,
    });

    // Write session header
    this.writeHeader(options);
  }

  /** Full path to the log file */
  get logFilePath(): string {
    return this._logFilePath;
  }

  /** Full path to the log directory */
  get logDirPath(): string {
    return this._logDirPath;
  }

  /**
   * Write the session header with metadata.
   */
  private writeHeader(options: SessionLoggerOptions): void {
    const { port, rootDir, pid, jarPath } = options;
    const separator = '═'.repeat(72);
    const lines = [
      separator,
      `STW Session Log`,
      `Started: ${new Date().toISOString()}`,
      `Port:    ${port}`,
      `Root:    ${resolve(rootDir)}`,
      ...(pid ? [`PID:     ${pid}`] : []),
      ...(jarPath ? [`JAR:     ${jarPath}`] : []),
      separator,
      '',
    ];
    this.stream.write(lines.join('\n') + '\n');
  }

  /**
   * Write a timestamped line to the log.
   * Flushes immediately.
   */
  write(data: string): void {
    const timestamp = new Date().toISOString();
    const lines = data.split('\n');

    for (const line of lines) {
      // Don't write empty trailing newlines as separate entries
      if (line === '' && lines.indexOf(line) === lines.length - 1) continue;
      this.stream.write(`[${timestamp}] ${line}\n`);
    }
  }

  /**
   * Write raw data without timestamp prefix (for binary/chunk output).
   */
  writeRaw(data: string): void {
    this.stream.write(data);
  }

  /**
   * Close the log file gracefully.
   */
  close(): void {
    const separator = '─'.repeat(72);
    this.stream.write(`\n${separator}\nSession ended: ${new Date().toISOString()}\n${separator}\n`);
    this.stream.end();
  }
}

/**
 * List log files in the given log directory, sorted by modification time (newest first).
 * @param logDir - Directory to scan for .log files
 * @param limit - Max number of files to return (default: 10)
 */
export function listLogFiles(logDir: string, limit = 10): { name: string; path: string; size: number; mtime: Date }[] {
  if (!existsSync(logDir)) {
    return [];
  }

  const files = readdirSync(logDir)
    .filter((f) => f.endsWith('.log') && f.startsWith('stw-'))
    .map((name) => {
      const fullPath = join(logDir, name);
      const stat = statSync(fullPath);
      return { name, path: fullPath, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return files.slice(0, limit);
}

/**
 * Open a log file for direct fd-based stdio redirection (background mode).
 * Returns the file path used.
 */
export function openLogFileForBackground(options: {
  port: number;
  rootDir: string;
  logDir?: string;
}): { logFilePath: string; logDirPath: string } {
  const { port, rootDir, logDir } = options;
  const resolvedLogDir = resolveLogDir(logDir);

  if (!existsSync(resolvedLogDir)) {
    mkdirSync(resolvedLogDir, { recursive: true });
  }

  const filename = generateLogFilename(port);
  const logFilePath = join(resolvedLogDir, filename);

  // Write a header to the log file before the process starts writing to it
  const separator = '═'.repeat(72);
  const header = [
    separator,
    `STW Session Log (background)`,
    `Started: ${new Date().toISOString()}`,
    `Port:    ${port}`,
    `Root:    ${resolve(rootDir)}`,
    separator,
    '',
  ].join('\n') + '\n';
  writeFileSync(logFilePath, header, 'utf8');

  return { logFilePath, logDirPath: resolvedLogDir };
}
