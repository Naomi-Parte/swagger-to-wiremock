# swagger-to-wiremock

> Convert OpenAPI/Swagger specs into native WireMock JSON stub mappings — offline, deterministic, zero config.

[![npm version](https://img.shields.io/npm/v/swagger-to-wiremock.svg)](https://www.npmjs.com/package/swagger-to-wiremock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## The Problem

Manually creating WireMock mapping files from OpenAPI specs is tedious, error-prone, and causes drift. A typical API with 30 endpoints × 3 response codes = 90 mapping files to maintain by hand.

## The Solution

```bash
npx swagger-to-wiremock convert ./api.yaml --serve
```

One command: generate stubs + start WireMock. Ready to test.

## Installation

```bash
# Use directly with npx (no install needed)
npx swagger-to-wiremock convert ./api.yaml

# Or install globally
npm install -g swagger-to-wiremock

# Or as a dev dependency
npm install -D swagger-to-wiremock
```

## Quick Start

```bash
# Generate stubs and start mock server (one command)
npx swagger-to-wiremock convert ./petstore.yaml --serve

# Or generate stubs only (split by status class — default)
npx swagger-to-wiremock convert ./petstore.yaml -o ./stubs

# Start WireMock from existing stubs
npx swagger-to-wiremock serve ./stubs/2xx
```

## Output Structure

By default, output is split by HTTP status class:

```
stubs/
├── 2xx/
│   ├── mappings/
│   │   ├── get-pets-200.json
│   │   └── post-pets-201.json
│   └── __files/
│       ├── get-pets-200.json
│       └── post-pets-201.json
└── 5xx/
    ├── mappings/
    │   └── get-pets-default.json
    └── __files/
        └── get-pets-default.json
```

Each folder is directly usable: `java -jar wiremock.jar --root-dir ./stubs/2xx`

Use `--flat` for a single folder with all statuses (priority-ordered):

```bash
npx swagger-to-wiremock convert ./api.yaml -o ./stubs --flat
```

## CLI Reference

```
swagger-to-wiremock convert <input> [options]

Options:
  -o, --output <dir>     Output directory (default: ./<spec-name>)
  -s, --seed <number>    Seed for deterministic output (default: 42)
  -v, --verbose          Show detailed pipeline logs
  -q, --quiet            Suppress all output except errors
  --status <codes>       Filter by status: 2xx, 4xx, 5xx, or specific codes
  --flat                 Single folder output (all statuses, priority-ordered)
  --empty                Generate skeleton stubs with TODO placeholder bodies
  --dry-run              Show what would be generated without writing
  --no-clean             Don't remove output directory before writing
  --serve                Start WireMock after generating stubs
  --port <port>          WireMock port (default: 8080, used with --serve)
  --jar <path>           Path to WireMock standalone JAR
  --no-security          Skip security scheme matchers
  --help-examples        Show usage examples

swagger-to-wiremock serve [target] [options]

Options:
  -p, --port <port>      WireMock port (default: 8080)
  --jar <path>           Path to WireMock standalone JAR
  --stub <status>        Start a catch-all server returning the given HTTP status code
  --background           Start server in background (detached)
  -v, --verbose          Show detailed logs
  -q, --quiet            Suppress output except errors

swagger-to-wiremock status

  List running background WireMock servers (port, PID, stubs dir, started time)

swagger-to-wiremock stop [port]

  Stop a background WireMock server by port, or all servers if no port given

swagger-to-wiremock init [options]

  Generate a .stwrc.yaml config file with all options documented
  -f, --force            Overwrite existing config file

swagger-to-wiremock config <set|get|unset|list> [key] [value]

  set <key> <value>      Set a global config value
  get <key>              Show a config value
  unset <key>            Remove a config value
  list                   Show all config values

  Valid keys: jar, port, wiremock-dir
```

> **Tip:** The binary is also available as `stw` — a short alias that works
> identically to `swagger-to-wiremock`. Use `stw convert`, `stw serve`, etc.

## Project Configuration

Teams can commit a `.stwrc.yaml` file to the repo so everyone uses the same defaults — no CLI flags needed.

```bash
# Scaffold a fully-documented config file
stw init
```

This creates a `.stwrc.yaml` with all available options commented out and documented. Uncomment the ones you want:

```yaml
# .stwrc.yaml
output: ./wiremock-stubs
seed: 42
flat: true
status: 2xx,4xx
no-security: true
port: 9090
```

### `wiremock-dir` — Centralized Output Parent

Set a parent directory where all generated stubs are placed. Each spec becomes a subfolder:

```yaml
# .stwrc.yaml
wiremock-dir: ./wiremock
```

```bash
stw convert petstore.yaml      # → ./wiremock/petstore/
stw convert billing-api.yaml   # → ./wiremock/billing-api/
stw convert petstore.yaml -o ./custom  # → ./custom/ (explicit -o wins)
```

Also available as a global config:
```bash
stw config set wiremock-dir ./wiremock
```

When not set, output goes to `./<spec-name>/` in the current directory.

**Discovery order** (first match wins):
1. `.stwrc.yaml` in cwd
2. `.stwrc.yml` in cwd
3. `.stwrc.json` in cwd
4. Walk up to git root (checking each directory)
5. `package.json` → `"swagger-to-wiremock"` key

CLI flags always override config file values.

## Usage Examples

```bash
# Basic generation
stw convert ./api.yaml

# Generate + serve (one command workflow)
stw convert ./api.yaml --serve --port 9090

# Swagger 2.0 spec (auto-converted)
stw convert ./legacy-api-swagger2.yaml

# Only error responses
stw convert ./api.yaml --status 4xx,5xx

# Skeleton for testers to fill in
stw convert ./api.yaml --empty

# Skip auth matchers for easier testing
stw convert ./api.yaml --no-security

# Set JAR path once (never pass --jar again)
stw config set jar /path/to/wiremock-standalone-3.3.1.jar

# Custom seed for different fake data
stw convert ./api.yaml -s 99

# Start mock server in background from existing stubs
stw serve ./wiremock-stubs --background

# Check running servers
stw status

# Stop a server
stw stop 8080

# Initialize project config
stw init
```

## Features

### Request Body Matching

POST/PUT/PATCH endpoints validate request body structure:

```json
{
  "request": {
    "method": "POST",
    "urlPathPattern": "/pets",
    "bodyPatterns": [
      { "matchesJsonPath": "$.id" },
      { "matchesJsonPath": "$.name" }
    ]
  }
}
```

WireMock only matches if the request body contains the required fields from the spec.

### Security Scheme Matchers

Auth requirements from `securitySchemes` are applied automatically:

| Scheme | Matcher |
|--------|---------|
| Bearer (JWT) | `Authorization: [REDACTED_TOKEN]` |
| Basic | `Authorization: Basic .+` |
| API Key (header) | `X-API-Key: .+` |
| API Key (query) | `?api_key=.+` |
| OAuth2 / OIDC | `Authorization: [REDACTED_TOKEN]` |
| mTLS | Skipped (transport-layer) |

Use `--no-security` to generate stubs without auth matchers.

### Custom WireMock Extensions (`x-wiremock-*`)

Add WireMock-specific behaviour directly in your OpenAPI spec using custom extension fields:

```yaml
paths:
  /pets:
    get:
      x-wiremock-delay:
        type: fixed
        milliseconds: 2000
      x-wiremock-priority: 1
      x-wiremock-scenario:
        name: "Pet lifecycle"
        requiredState: "Started"
        newState: "Has pets"
      responses:
        "200":
          description: OK
```

**Supported extensions:**

| Extension | Effect in WireMock |
|-----------|-------------------|
| `x-wiremock-delay` | Adds response delay — `fixed` (milliseconds), `uniform` (lower/upper), or `lognormal` (median/sigma) |
| `x-wiremock-priority` | Overrides the default status-based priority (lower number = higher priority) |
| `x-wiremock-scenario` | Enables stateful stubs — stub only matches when scenario is in `requiredState`, then transitions to `newState` |

**Generated mapping output:**

```json
{
  "priority": 1,
  "scenarioName": "Pet lifecycle",
  "requiredScenarioState": "Started",
  "newScenarioState": "Has pets",
  "response": {
    "status": 200,
    "fixedDelayMilliseconds": 2000,
    "headers": { "Content-Type": "application/json" },
    "bodyFileName": "get-pets-200.json"
  }
}
```

Extensions are optional — specs without `x-wiremock-*` fields generate standard stubs as before.

### Serve Command

Start WireMock directly — no manual JAR management:

```bash
# Serve directly from a spec file (convert + serve in one step)
stw serve ./petstore.yaml                    # Convert then serve
stw serve ./api.yaml --status 2xx            # Only 2xx responses
stw serve ./api.yaml --port 9090 --no-security  # Custom port, skip auth
```

```bash
# Quick catch-all server (no spec needed)
stw serve --stub 200                    # Returns 200 for any request
stw serve --stub 503 --port 3000        # Simulate downstream outage
stw serve --stub 429 --background       # Rate-limit stub, running in background
```


```bash
# Set JAR path once
swagger-to-wiremock config set jar ./wiremock/wiremock-standalone-3.3.1.jar

# Generate + serve
swagger-to-wiremock convert ./api.yaml --serve

# Or serve existing stubs
swagger-to-wiremock serve ./stubs/2xx --port 9090

# Run in background (detached process)
stw serve ./stubs --background

# Check what's running
stw status

# Stop by port
stw stop 9090

# Stop all servers
stw stop --all
```

JAR resolution: `--jar` flag → `WIREMOCK_JAR` env → global config → auto-detect in ./wiremock/ or ./lib/

## Tester Workflow

1. **Generate stubs** for the status you want to test:
   ```bash
   npx swagger-to-wiremock convert ./api.yaml -o ./stubs --status 4xx --empty
   ```
2. **Customise response bodies** — edit `__files/*.json`:
   ```bash
   echo '{"error": "Not found", "code": "PET_404"}' > ./stubs/4xx/__files/get-pets-petId-404.json
   ```
3. **Start WireMock**:
   ```bash
   npx swagger-to-wiremock serve ./stubs/4xx
   ```
4. **Test your app** against the mock:
   ```bash
   curl http://localhost:8080/pets/123  # → 404 with your custom body
   ```

## Programmatic API

```typescript
import {
  parseOpenAPISpec,
  transformSpec,
  generateMappings,
  writeStubs,
  startServer,
} from 'swagger-to-wiremock';

const spec = await parseOpenAPISpec('./api.yaml');
const records = transformSpec(spec);
const mappings = generateMappings(records, 42);

await writeStubs(mappings, records, {
  outputDir: './wiremock-stubs',
  clean: true,
  seed: 42,
});
```

## Deterministic Output

Same input + same seed = byte-for-byte identical output across runs. Safe for CI diffs and snapshot testing.

```bash
npx swagger-to-wiremock convert ./api.yaml -o ./out1 -s 42
npx swagger-to-wiremock convert ./api.yaml -o ./out2 -s 42
diff -r out1 out2  # No differences
```

## Supported Formats

- ✅ OpenAPI 3.0.x (YAML and JSON)
- ✅ OpenAPI 3.1.x (YAML and JSON) — type arrays, `const`, `prefixItems` normalized
- ✅ Swagger 2.0 (YAML and JSON) — auto-converted to OpenAPI 3.0 in-memory
- ✅ `$ref` resolution (local, remote, circular)
- ✅ Path parameters (format-aware regex)
- ✅ Required query parameters
- ✅ Response examples and schema generation
- ✅ Request body matching (required fields)
- ✅ Security schemes (Bearer, Basic, API Key, OAuth2, OIDC)
- ✅ `allOf` / `oneOf` / `anyOf`
- ✅ Deterministic output (seeded)

## Not Yet Supported

- ❌ WireMock response templating
- ❌ `x-wiremock-*` custom extensions
- ❌ `--watch` mode (regenerate on spec change)
- ❌ Diff command (compare two generation runs)

## License

MIT
