# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-08-19

### Added

- **Port range config** — New global config keys `port-range-min` and `port-range-max` restrict which ports `stw` is allowed to use. Prevents port-hoarding in shared test environments. Cross-validated at set-time (min cannot exceed max). Set via `stw config set port-range-min 3000` / `stw config set port-range-max 4000`.
- **Port auto-increment** — When the requested port is unavailable, `stw` automatically tries the next port in sequence (up to 20 attempts within the configured range) and prints a `⚠️` warning. Enabled by default. Disable per-command with `--no-auto-port` or globally with `stw config set auto-port false`. Uses TCP probe to detect OS-level port conflicts, not just stw-managed servers.

---

## [1.0.0] - 2026-08-19

### Changed

- **Project config discovery** — No longer stops at the git root (`.git/` boundary). Discovery now walks linearly from cwd up to the filesystem root, checking each directory for `.stwrc.yaml`, `.stwrc.yml`, `.stwrc.json`, then falling back to `package.json` key. This supports shared Linux server setups where team configs live in ancestor directories above any git repository.
- **Dynamic CLI name** — Help text and examples now reflect the actual binary name used to invoke the tool (`stw`, `swagger-to-wiremock`, or custom). Previously hardcoded to `swagger-to-wiremock`.

### Added

- **`--no-seed` flag** — Disable deterministic seeding for `convert` and `serve` commands. Each run produces different fake data using `Math.random()`. Also supported in project config as `no-seed: true`.


### Removed

- `findGitRoot()` internal function — replaced by unbounded linear traversal.

## [0.4.0] - 2026-08-18

### Added

- **Documentation overhaul** — README fully rewritten to match v0.3.x feature set.
  - Added `--templated` flag documentation to `convert` command reference.
  - Added `logs` subcommand documentation.
  - Added `--status`, `--flat`, `--seed`, `--no-security`, `--no-logs` options to `serve` command reference.
  - Added `-y`/`--yes` flag to `stop` command reference.
  - Added `-l`/`--local` flag documentation for `config set|get|unset|list`.
  - Added `log-dir` and `no-logs` to global config keys documentation.
  - Added "Session Logging" feature section.
  - Added "Response Templating" feature section.
  - Updated programmatic API example to use options object (`{ seed, templated }`).
  - Updated project config example to include `templated` key.
  - Removed "Not Yet Supported" section — all listed features are now implemented.
  - Moved `WireMock response templating` and `x-wiremock-* custom extensions` to "Supported Formats" list.

### Fixed

- Version references updated to 0.4.0 across package.json and CLI source.

## [0.3.0] - 2026-08-14

### Added

- **`--templated` flag** — Enable WireMock response templating (Handlebars). Generated response bodies use template syntax to echo request data (path parameters, query parameters, headers).
- **`x-wiremock-*` custom extensions** — Add WireMock-specific behaviour directly in OpenAPI specs:
  - `x-wiremock-delay` — Response delays (fixed, uniform, lognormal distributions).
  - `x-wiremock-priority` — Override default status-based priority.
  - `x-wiremock-scenario` — Stateful stubs with scenario state transitions.
- **`logs` subcommand** — List, tail, or clear serve session log files. Options: `--port`, `--tail`, `--lines`, `--clear`.
- **Session logging** — Background serve sessions are logged automatically to `~/.swagger-to-wiremock/logs/` (configurable via `log-dir`). Disable with `--no-logs` or `config set no-logs true`.
- **`config -l` (local) flag** — `config set -l`, `config get -l`, `config unset -l`, `config list -l` to manage local project config (`.stwrc.yaml`) directly from the CLI.
- **`serve` spec-file conversion** — `stw serve ./api.yaml` now auto-converts a spec file to stubs in a temp directory and serves them. Supports `--status`, `--flat`, `--seed`, `--no-security` options for inline conversion.
- **`stop --yes` flag** — Skip confirmation prompt when stopping all servers.
- **`log-dir` config key** — Set a custom directory for serve session logs (global and local).
- **`no-logs` config key** — Disable session logging entirely (global and local).
- **`serve --no-logs`** — Disable logging for a single serve session.
- **`templated` local config key** — Enable response templating via `.stwrc.yaml`.

### Changed

- **`serve` default mode** — Now runs in background by default. Use `-f`/`--foreground` for blocking mode.
- **Config keys** expanded: `jar`, `port`, `output-dir`, `foreground`, `log-dir`, `no-logs`.
- **`generateMappings` API** — Now accepts an options object `{ seed, templated }` instead of a bare seed number (number-only form still accepted for backwards compatibility).

## [0.2.0] - 2026-08-10

### Added

- **Swagger 2.0 auto-conversion** — Swagger 2.0 specs (YAML or JSON) are now automatically converted to OpenAPI 3.0 in-memory via `swagger2openapi`. No new flags required.
- **`--serve` flag + `serve` subcommand** — Start WireMock standalone directly after generation (`convert --serve`) or from existing stubs (`serve <dir>`). Includes `--port` and `--jar` flags, JAR auto-discovery, Java detection, and graceful Ctrl+C shutdown.
- **OpenAPI 3.1 support** — Specs using `openapi: "3.1.x"` are now accepted. Type arrays (`type: ["string", "null"]`), `const`, `prefixItems`, and `$defs` are normalized for compatibility with json-schema-faker.
- **Request body matchers** — POST/PUT/PATCH endpoints now generate `bodyPatterns` with `matchesJsonPath` assertions for required fields, ensuring WireMock only matches requests with the expected body structure.
- **Security scheme matchers** — `securitySchemes` are resolved and produce request header/query matchers: Bearer (`Authorization: [REDACTED_TOKEN]`), Basic (`Authorization: Basic .+`), API key (header or query), OAuth2, and OpenID Connect. mTLS is skipped gracefully (transport-layer).
- **`--no-security` flag** — Skip security scheme matchers entirely for simplified testing.
- **Global config** — `config set|get|unset|list` subcommand for persistent user settings (`~/.swagger-to-wiremock/config.json`). Set `jar` path once, never pass `--jar` again.
- **`init` subcommand** — Generate a `.stwrc.yaml` config file with all options documented.
- **`status` subcommand** — List running background WireMock servers (port, PID, stubs dir, started time).
- **`stop` subcommand** — Stop a background WireMock server by port, or `--all` to stop all.
- **`dir` subcommand** — Print the resolved wiremock output directory.
- **Project config (`.stwrc.yaml`)** — Teams can commit shared defaults. Discovery walks up to git root.
- **`output-dir` config** — Centralized parent directory for generated stubs.
- **`--stub` mode** — `stw serve --stub <status>` starts a catch-all server returning the given HTTP status (no spec needed).

### Changed

- **JAR resolution priority chain** expanded: `--jar` flag → `WIREMOCK_JAR` env → global config → auto-detect in cwd/wiremock/lib.
- **Version validation** now accepts OpenAPI 3.0.x and 3.1.x (previously rejected 3.1).
- **Description** updated to reflect Swagger 2.0 + OpenAPI 3.1 support.

### Fixed

- Schemas with 3.1 type arrays no longer crash json-schema-faker.
- JsonPath bracket notation for special-character field names uses `$['field']` (not `$.['field']`).

## [0.1.0] - 2026-08-07

### Added

- **CLI tool**: `swagger-to-wiremock convert <spec> [options]`
- **OpenAPI 3.0 parsing** with full `$ref` resolution via `@apidevtools/swagger-parser`
- **Swagger 2.0 detection** with clear error message directing users to convert
- **Transform pipeline** extracting operations, path/query params, response schemas
- **URL pattern generation** with format-aware regex for path parameters (UUID, integer, etc.)
- **Response body generation** from examples (priority) or schema (via `json-schema-faker`)
- **WireMock mapping generation** with deterministic output (seeded UUIDs + seeded faker)
- **Split output by status class** — default output creates `2xx/`, `4xx/`, `5xx/` folders, each directly usable by WireMock
- **`--flat` flag** — single `mappings/` + `__files/` folder (all statuses, priority-ordered)
- **`--status` filter** — generate only specific status classes or codes (e.g. `--status 4xx,5xx`)
- **Placeholder synthesis** — `--status 400` generates placeholders even if 400 isn't in the spec
- **`--empty` flag** — skeleton generation with TODO placeholder response bodies
- **`--seed` flag** — deterministic output (default seed: 42)
- **`--dry-run` flag** — preview without writing files
- **`--clean` / `--no-clean`** — control output directory cleanup
- **`--verbose` / `--quiet`** — output verbosity control
- **JSON and YAML input** — both produce byte-for-byte identical output
- **Programmatic API** — all pipeline functions exported for library usage
