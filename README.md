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
  --no-seed              Disable seeded generation (random output each run)
  --status <codes>       Filter by status: 2xx, 4xx, 5xx, or specific codes
  --flat                 Single folder output (all statuses, priority-ordered)
  --empty                Generate skeleton stubs with TODO placeholder bodies
  --templated            Use WireMock response templating (Handlebars) to echo request data
  --dry-run              Show what would be generated without writing
  --no-clean             Don't remove output directory before writing
  --serve                Start WireMock after generating stubs
  --port <port>          WireMock port (default: 8080, used with --serve)
  --jar <path>           Path to WireMock standalone JAR
  --no-security          Skip security scheme matchers
  --help-examples        Show usage examples
```

```
swagger-to-wiremock serve [target] [options]

  Start WireMock from a stubs directory, spec file, or catch-all stub (--stub).
  Runs in background by default.

  Target can be:
    <dir>                  Existing stubs directory (must contain mappings/)
    <spec.yaml|json>       Spec file — auto-converted to stubs then served
    (omitted)              Defaults to ./wiremock/ if it exists

Options:
  -p, --port <port>      WireMock port (default: 8080)
  --jar <path>           Path to WireMock standalone JAR
  --stub <status>        Start a catch-all server returning the given HTTP status code
  --status <codes>       Filter by status code when serving a spec file (e.g. 2xx, 4xx)
  --flat                 Use flat output when converting a spec file
  -s, --seed <seed>      Seed for deterministic response generation
  --no-security          Skip security scheme matchers when converting a spec file
  --no-seed              Disable seeded generation (random output each run)
  -f, --foreground       Keep server in foreground (block until Ctrl+C)
  -b, --background       Start server in background [default]
  -v, --verbose          Show detailed logs
  -q, --quiet            Suppress output except errors
  --no-logs              Disable session logging for this serve
```

```
swagger-to-wiremock status

  List running background WireMock servers (port, PID, stubs dir, started time)
```

```
swagger-to-wiremock stop [port] [options]

  Stop a background WireMock server by port, or all servers.

Options:
  -a, --all              Stop all running servers
  -y, --yes              Skip confirmation prompt
```

```
swagger-to-wiremock dir

  Print the resolved wiremock output directory (for use with cd)
```

```
swagger-to-wiremock init [options]

  Generate a .stwrc.yaml config file with all options documented

Options:
  -f, --force            Overwrite existing config file
```

```
swagger-to-wiremock logs [options]

  List or tail serve session log files

Options:
  -p, --port <port>      Show log for a specific port
  -t, --tail             Tail the latest (or port-specific) log file
  -n, --lines <count>    Number of lines to show when tailing (default: 50)
  --clear                Delete all log files in the log directory
```

```
swagger-to-wiremock config <set|get|unset|list> [key] [value] [options]

  Manage global and local project configuration.

  set <key> <value>      Set a global config value
  set -l <key> <value>   Set a local project config value (.stwrc.yaml)
  get <key>              Show a config value
  get -l <key>           Show a local project config value
  unset <key>            Remove a config value
  unset -l <key>         Remove from local project config
  list                   Show all global config values
  list -l                Show local project config values

  Global config keys: jar, port, port-range-min, port-range-max, auto-port, output-dir, foreground, log-dir, no-logs
```

```
swagger-to-wiremock serve [target] [options]

  Additional options (v1.1.0+):
  --no-auto-port           Disable automatic port increment when port is unavailable
```

> **Tip:** The binary is also available as `stw` — a short alias that works
> identically to `swagger-to-wiremock`. Use `stw convert`, `stw serve`, etc.

## `STW_HOME` — Custom Home Directory

By default, all stw data lives in `~/.swagger-to-wiremock/` (config, logs, server registry). Override with the `STW_HOME` environment variable:

```bash
export STW_HOME=/opt/stw
stw serve --stub 200 --port 8080
# Config: /opt/stw/config.json
# Logs:   /opt/stw/logs/stw-8080.log
# Registry: /opt/stw/servers.json
```

Set it in your shell profile (`.bashrc`, `.zshrc`, etc.) for persistence:

```bash
echo 'export STW_HOME=/opt/stw' >> ~/.bashrc
```

| `STW_HOME` set? | Home directory |
|-----------------|----------------|
| No (default) | `~/.swagger-to-wiremock/` |
| Yes | Value of `STW_HOME` |

The directory is created automatically on first use.

## Project Configuration

Teams can commit a `.stwrc.yaml` file to the repo so everyone uses the same defaults — no CLI flags needed.

```bash
# Scaffold a fully-documented config file
stw config init
```

This creates a `.stwrc.yaml` with all available options commented out and documented. Uncomment the ones you want:

```yaml
# .stwrc.yaml
output: ./wiremock-stubs
seed: 42              # Fixed seed for deterministic output
# no-seed: true       # Or use this instead for random output each run
flat: true
status: 2xx,4xx
no-security: true
port: 9090
templated: true
```

### `output-dir` — Centralized Output Parent

Set a parent directory where all generated stubs are placed. Each spec becomes a subfolder:

```yaml
# .stwrc.yaml
output-dir: ./wiremock
```

```bash
stw convert petstore.yaml      # → ./wiremock/petstore/
stw convert billing-api.yaml   # → ./wiremock/billing-api/
stw convert petstore.yaml -o ./custom  # → ./custom/ (explicit -o wins)
```

Also available as a global config:
```bash
stw config set output-dir ./wiremock
```

When not set, output goes to `./<spec-name>/` in the current directory.

### `stw dir` — Show Output Directory

Prints the resolved `output-dir` path. Useful for checking where stubs will be generated:

```bash
stw dir                     # prints the absolute output-dir path
```

**Discovery order** (first match wins):
1. `.stwrc.yaml` in cwd
2. `.stwrc.yml` in cwd
3. `.stwrc.json` in cwd
4. Walk up to filesystem root (checking each directory)
5. `package.json` → `"swagger-to-wiremock"` key

CLI flags always override config file values.

### Port Range — Restrict Allowed Ports

Enforce a valid port window to prevent port-hoarding in shared test environments. This is a **global-only** setting (not project-level):

```bash
stw config set port-range-min 3000
stw config set port-range-max 4000
```

Any port used with `--port`, project config, or the global `port` default is validated against this range:

```bash
stw serve ./stubs --port 9090
# ❌ Port 9090 is outside the allowed range (3000–4000).

stw serve ./stubs --port 3500
# ✅ Works normally
```

Remove the restriction:
```bash
stw config unset port-range-min
stw config unset port-range-max
```

### Port Auto-Increment

When the requested port is unavailable, `stw` automatically tries the next port in sequence. This is enabled by default — no flag needed:

```bash
# Port 8080 is already in use by another process
stw serve ./stubs
# ⚠️  Port 8080 unavailable — using 8081 instead.
# ✅ WireMock started on port 8081 (PID: 12345)
```

Auto-increment respects the configured port range and caps at 20 attempts.

Disable for strict port control:
```bash
# Via CLI flag
stw serve ./stubs --no-auto-port
# ❌ Port 8080 is already in use (PID: 1234, stubs: ./foo)

# Or globally
stw config set auto-port false
```

Re-enable:
```bash
stw config set auto-port true
```

### Logrotate (Linux/macOS)

Integrate with the system `logrotate` for automatic log rotation, compression, and retention. **Unix only** — not available on Windows.

```bash
# Enable logrotate mode (switches to stable log filenames)
stw logrotate --enable

# Generate system logrotate config
sudo stw logrotate --init
# ✅ Written: /etc/logrotate.d/swagger-to-wiremock

# Or use copytruncate strategy (simpler, no SIGHUP needed)
sudo stw logrotate --init --copytruncate

# Check status
stw logrotate --status
# Logrotate: enabled
# Log naming: stable (stw-<port>.log)
# System config: /etc/logrotate.d/swagger-to-wiremock

# Disable (revert to timestamped filenames)
stw logrotate --disable
```

**How it works:**

| Mode | Log filename | Rotation |
|------|-------------|----------|
| Disabled (default) | `stw-8080-20260820-023119.log` | Manual (`stw logs --clear`) |
| Enabled | `stw-8080.log` | Automatic via system logrotate |

Two logrotate strategies are supported:

- **postrotate + SIGHUP** (default) — logrotate renames the file, then sends SIGHUP to stw processes (PIDs from `servers.json`). Zero data loss.
- **copytruncate** (`--copytruncate` flag) — logrotate copies then truncates in place. Simpler, no signal handling needed, but a theoretical microsecond of log loss.

Foreground serve sessions (`-f`) handle SIGHUP automatically to reopen log files after rotation.

```
swagger-to-wiremock logrotate [options]

Options:
  --enable               Switch to stable log filenames (stw-<port>.log)
  --disable              Switch back to timestamped filenames
  --init                 Generate /etc/logrotate.d/swagger-to-wiremock config
  --copytruncate         Use copytruncate strategy with --init
  --status               Show logrotate integration status
```

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

# Response templating (Handlebars — echoes request data in responses)
stw convert ./api.yaml --templated

# Skip auth matchers for easier testing
stw convert ./api.yaml --no-security

# Set JAR path once (never pass --jar again)
stw config set jar /path/to/wiremock-standalone-3.3.1.jar

# Custom seed for different fake data
stw convert ./api.yaml -s 99

# Start mock server in background from existing stubs
stw serve ./wiremock-stubs              # starts in background by default

# Serve directly from a spec file
stw serve ./petstore.yaml               # convert + serve in one step
stw serve ./api.yaml --status 2xx       # only 2xx responses

# Check running servers
stw status

# Stop a server
stw stop 8080

# Stop all servers (skip confirmation)
stw stop --all --yes

# View serve session logs
stw logs
stw logs --tail
stw logs --port 8080 --tail

# Initialize project config
stw config init
```

## Features

### Response Templating

Use `--templated` to enable WireMock's Handlebars-based response templating. Response bodies will echo request data (path params, query params, headers) using WireMock template syntax:

```bash
stw convert ./api.yaml --templated
```

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

Start WireMock directly — no manual JAR management. Runs in **background by default**
(use `-f` for foreground):

```bash
# Serve directly from a spec file (convert + serve in one step)
stw serve ./petstore.yaml                    # Convert then serve
stw serve ./api.yaml --status 2xx            # Only 2xx responses
stw serve ./api.yaml --port 9090 --no-security  # Custom port, skip auth
stw serve ./petstore.yaml -f                 # Foreground (block until Ctrl+C)
```

```bash
# Quick catch-all server (no spec needed)
stw serve --stub 200                    # Returns 200 for any request
stw serve --stub 503 --port 3000        # Simulate downstream outage
stw serve --stub 429                    # Rate-limit stub (background by default)
```

```bash
# Serve existing stubs
stw serve ./stubs/2xx --port 9090

# Check what's running
stw status

# Stop by port
stw stop 9090

# Stop all servers
stw stop --all
```

JAR resolution: `--jar` flag → `WIREMOCK_JAR` env → global config → auto-detect in ./wiremock/ or ./lib/

### Session Logging

Background serve sessions are logged automatically. View and manage logs:

```bash
stw logs                    # List all log files
stw logs --tail             # Tail the most recent log
stw logs --port 8080 --tail # Tail log for a specific port
stw logs --clear            # Delete all log files
```

Disable logging for a specific session with `--no-logs`, or globally:
```bash
stw config set no-logs true
```

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
const mappings = generateMappings(records, { seed: 42, templated: false });

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
- ✅ WireMock response templating (`--templated`)
- ✅ `x-wiremock-*` custom extensions (delay, priority, scenario)

## License

MIT
