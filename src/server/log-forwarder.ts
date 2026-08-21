#!/usr/bin/env node
/**
 * @file Log forwarder for background WireMock processes
 * @description A lightweight Node wrapper that:
 *   1. Spawns WireMock (Java) as a child process
 *   2. Pipes all stdout/stderr through a SessionLogger
 *   3. Handles SIGHUP to reopen log files (for logrotate)
 *   4. Forwards SIGTERM/SIGINT to WireMock for graceful shutdown
 *
 * This runs as a detached background process. The PID registered in
 * servers.json is THIS process (not WireMock's), so logrotate's
 * postrotate SIGHUP reaches Node — not Java.
 *
 * Usage (spawned by process-manager, not called directly):
 *   node log-forwarder.js <javaCmd> <logFile> <port> <rootDir> -- <wiremock args...>
 */

import { spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { WriteStream } from 'fs';

// ─── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const separatorIdx = args.indexOf('--');

if (separatorIdx < 4) {
  console.error('log-forwarder: invalid arguments');
  console.error('Usage: log-forwarder <javaCmd> <logFile> <port> <rootDir> -- <wiremock args...>');
  process.exit(1);
}

const javaCmd = args[0]!;
const logFile = args[1]!;
const port = args[2]!;
const rootDir = args[3]!;
const wmArgs = args.slice(separatorIdx + 1);

// ─── Logger (simple append stream with reopen) ───────────────────────────────

const logDir = dirname(logFile);
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

let stream: WriteStream = openLogStream();

function openLogStream(): WriteStream {
  return createWriteStream(logFile, { flags: 'a', encoding: 'utf8', highWaterMark: 0 });
}

function writeLog(data: string): void {
  stream.write(data);
}

function reopen(): void {
  stream.end();
  stream = openLogStream();
  writeLog(`[${new Date().toISOString()}] Log reopened (SIGHUP)\n`);
}

// Write header
const separator = '═'.repeat(72);
writeLog([
  separator,
  `STW Session Log (background)`,
  `Started: ${new Date().toISOString()}`,
  `Port:    ${port}`,
  `Root:    ${rootDir}`,
  separator,
  '',
].join('\n') + '\n');

// ─── Spawn WireMock ──────────────────────────────────────────────────────────

const child = spawn(javaCmd, wmArgs, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

if (child.stdout) {
  child.stdout.on('data', (chunk: Buffer) => writeLog(chunk.toString()));
}

if (child.stderr) {
  child.stderr.on('data', (chunk: Buffer) => writeLog(chunk.toString()));
}

child.on('exit', (code) => {
  writeLog(`\n[${new Date().toISOString()}] WireMock exited with code: ${code}\n`);
  stream.end();
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  writeLog(`\n[${new Date().toISOString()}] WireMock spawn error: ${err.message}\n`);
  stream.end();
  process.exit(1);
});

// ─── Signal handling ─────────────────────────────────────────────────────────

// SIGHUP → reopen log file (logrotate)
process.on('SIGHUP', () => {
  reopen();
});

// SIGTERM/SIGINT → forward to WireMock for graceful shutdown
process.on('SIGTERM', () => {
  writeLog(`[${new Date().toISOString()}] Received SIGTERM, forwarding to WireMock...\n`);
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  writeLog(`[${new Date().toISOString()}] Received SIGINT, forwarding to WireMock...\n`);
  child.kill('SIGINT');
});
