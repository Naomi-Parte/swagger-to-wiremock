# Changelog

All notable changes to this project will be documented in this file.

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

### Supported OpenAPI Features

- OpenAPI 3.0.x specifications (YAML and JSON)
- Path parameters with type/format-aware regex patterns
- Required query parameters (enum → regex alternation)
- Response examples (verbatim) and schemas (generated)
- Multiple response status codes per operation
- `$ref` resolution (local, remote, circular)
- `allOf` / `oneOf` / `anyOf` schema composition

### Not Yet Supported

- Swagger 2.0 input (planned for v0.2.0 — use `swagger2openapi` to convert first)
- OpenAPI 3.1 `type` arrays
- Security scheme request matchers
- Request body validation matchers
- WireMock response templating
- `x-wiremock-*` custom extensions
