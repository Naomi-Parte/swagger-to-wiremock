# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-08-10

### Added

- **Swagger 2.0 auto-conversion** — Swagger 2.0 specs (YAML or JSON) are now automatically converted to OpenAPI 3.0 in-memory via `swagger2openapi`. No new flags required.
- **`--serve` flag + `serve` subcommand** — Start WireMock standalone directly after generation (`convert --serve`) or from existing stubs (`serve <dir>`). Includes `--port` and `--jar` flags, JAR auto-discovery, Java detection, and graceful Ctrl+C shutdown.
- **OpenAPI 3.1 support** — Specs using `openapi: "3.1.x"` are now accepted. Type arrays (`type: ["string", "null"]`), `const`, `prefixItems`, and `$defs` are normalized for compatibility with json-schema-faker.
- **Request body matchers** — POST/PUT/PATCH endpoints now generate `bodyPatterns` with `matchesJsonPath` assertions for required fields, ensuring WireMock only matches requests with the expected body structure.
- **Security scheme matchers** — `securitySchemes` are resolved and produce request header/query matchers: Bearer (`Authorization: Bearer .+`), Basic (`Authorization: Basic .+`), API key (header or query), OAuth2, and OpenID Connect. mTLS is skipped gracefully (transport-layer).
- **`--no-security` flag** — Skip security scheme matchers entirely for simplified testing.
- **Global config** — `config set|get|unset|list` subcommand for persistent user settings (`~/.swagger-to-wiremock/config.json`). Set `jar` path once, never pass `--jar` again.

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
