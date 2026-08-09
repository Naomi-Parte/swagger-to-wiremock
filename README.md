# swagger-to-wiremock

> Convert OpenAPI 3.0 specs into native WireMock JSON stub mappings — offline, deterministic, zero config.

[![npm version](https://img.shields.io/npm/v/swagger-to-wiremock.svg)](https://www.npmjs.com/package/swagger-to-wiremock)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## The Problem

Manually creating WireMock mapping files from OpenAPI specs is tedious, error-prone, and causes drift. A typical API with 30 endpoints × 3 response codes = 90 mapping files to maintain by hand.

## The Solution

```bash
npx swagger-to-wiremock convert ./api.yaml -o ./wiremock-stubs
java -jar wiremock.jar --root-dir ./wiremock-stubs/2xx --port 8080
```

One command generates a complete WireMock standalone directory — ready to serve.

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
# Generate stubs (split by status class — default)
npx swagger-to-wiremock convert ./petstore.yaml -o ./stubs

# Start WireMock with happy path responses
java -jar wiremock.jar --root-dir ./stubs/2xx --port 8080

# Or with error responses
java -jar wiremock.jar --root-dir ./stubs/5xx --port 8080
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
  -o, --output <dir>     Output directory (default: ./wiremock)
  -s, --seed <number>    Seed for deterministic output (default: 42)
  -v, --verbose          Show detailed pipeline logs
  -q, --quiet            Suppress all output except errors
  --status <codes>       Filter by status: 2xx, 4xx, 5xx, or specific codes (comma-separated)
  --flat                 Single folder output (all statuses, priority-ordered)
  --empty                Generate skeleton stubs with TODO placeholder bodies
  --dry-run              Show what would be generated without writing
  --no-clean             Don't remove output directory before writing
  --help-examples        Show usage examples
```

## Usage Examples

```bash
# Basic generation
npx swagger-to-wiremock convert ./api.yaml

# Only error responses
npx swagger-to-wiremock convert ./api.yaml --status 4xx,5xx

# Skeleton for testers to fill in
npx swagger-to-wiremock convert ./api.yaml --empty

# Placeholder for a status not in the spec
npx swagger-to-wiremock convert ./api.yaml --status 400

# Custom seed for different fake data
npx swagger-to-wiremock convert ./api.yaml -s 99

# Flat output for CI pipelines
npx swagger-to-wiremock convert ./api.yaml --flat
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
   java -jar wiremock.jar --root-dir ./stubs/4xx --port 8080
   ```
4. **Test your app** against the mock:
   ```bash
   curl http://localhost:8080/pets/123  # → 404 with your custom body
   ```

## Programmatic API

```typescript
import { parseOpenAPISpec, transformSpec, generateMappings, writeStubs } from 'swagger-to-wiremock';

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

## Supported

- ✅ OpenAPI 3.0.x (YAML and JSON)
- ✅ Swagger 2.0 (YAML and JSON, auto-converted to OpenAPI 3.0 in-memory)
- ✅ `$ref` resolution (local, remote, circular)
- ✅ Path parameters (format-aware regex)
- ✅ Required query parameters
- ✅ Response examples and schema generation
- ✅ `allOf` / `oneOf` / `anyOf`
- ✅ Multiple response codes per operation
- ✅ Deterministic output

## Not Yet Supported

- ❌ OpenAPI 3.1 type arrays
- ❌ Security scheme matchers
- ❌ Request body matchers
- ❌ WireMock response templating

## Roadmap

- **v0.3.0** — Request body matchers, security schemes
- **v1.0.0** — Full OpenAPI 3.1 support, response templating, `x-wiremock-*` extensions

## License

MIT
