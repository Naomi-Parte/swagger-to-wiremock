/**
 * @file Server module types
 * @description Configuration types for WireMock server management
 */

export interface ServerOptions {
  /** Root directory containing WireMock stubs (with mappings/ and __files/ subdirs) */
  rootDir: string;
  /** Port to run WireMock on (default: 8080) */
  port?: number;
  /** Explicit path to wiremock JAR file */
  jarPath?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface JarResolverOptions {
  /** Explicit path from --jar flag */
  explicitPath?: string;
  /** Current working directory for relative resolution */
  cwd?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface ServerProcess {
  /** Kill the WireMock process */
  stop: () => void;
  /** Port the server is running on */
  port: number;
  /** Wait for the process to exit */
  waitForExit: () => Promise<number | null>;
}

/** Entry in the background server registry (~/.swagger-to-wiremock/servers.json) */
export interface ServerRegistryEntry {
  /** Port the server is running on */
  port: number;
  /** OS process ID */
  pid: number;
  /** Directory being served (stubs root) */
  rootDir: string;
  /** ISO timestamp when the server was started */
  startedAt: string;
}
