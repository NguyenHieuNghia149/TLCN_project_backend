# Function-Signature-Only Judge

## Overview

Backend now judges problems in one mode only: `function_signature`.

Users implement logic inside the language-specific `Solution` template, and the server generates the full execution wrapper that:

- parses structured testcase JSON
- calls the target function on `Solution`
- measures only the user function runtime
- prints the wrapper envelope as JSON

Supported submission languages are:

- `cpp`
- `java`
- `python`

## Function Signature AST

Each problem stores a required `functionSignature` JSON AST in `problems.function_signature`.

```json
{
  "name": "twoSum",
  "returnType": { "type": "array", "items": "integer" },
  "args": [
    { "name": "nums", "type": "array", "items": "integer" },
    { "name": "target", "type": "integer" }
  ]
}
```

Supported types:

- scalar: `integer`, `string`, `boolean`
- container: `array<scalar>`

## Canonical Testcase Storage

Structured JSON is the only testcase source of truth:

- `testcases.input_json`
- `testcases.output_json`

The legacy text cache columns are no longer stored in the database.

## JSON-First Read Model

Challenge and submission responses still expose `input` and `output`, but those fields are always derived on the fly from JSON.

```ts
{
  inputJson: Record<string, unknown>;
  outputJson: unknown;
  input: string;
  output: string;
}
```

Important rules:

- execution never depends on text display fields
- `buildTestcaseDisplay(...)` is the shared formatter for read-time display
- `buildFunctionInputDisplayValue(...)` and `canonicalizeStructuredValue(...)` remain the underlying formatting helpers
- if `functionSignature` is missing at read-time, the API logs the `problemId` and returns `500` with `problem configuration invalid`

## Queue And Execution Pipeline

Internal jobs are wrapper-only and no longer carry an explicit execution mode.

```ts
{
  functionSignature: AST;
  testcases: Array<{
    inputJson: Record<string, unknown>;
    outputJson: unknown;
  }>;
}
```

Worker behavior:

- generates full executable source with `wrapperGenerator.ts`
- sends `JSON.stringify(inputJson)` to sandbox stdin
- sends canonical JSON output as expected output
- derives display text from JSON via shared helpers when needed
- does not send `execution_mode` on new gRPC requests

Sandbox behavior:

- wrapper is the only runtime behavior
- during the compatibility phase, the gRPC boundary accepts `execution_mode = "wrapper"`, an omitted field, or `""`
- any other `execution_mode` is rejected with `INVALID_ARGUMENT`
- reads the last non-empty stdout line as the wrapper envelope
- requires this exact contract:

```json
{"actual_output": <json-value>, "time_taken_ms": <non-negative number>}
```

- compares outputs with JSON parsing + deep equality
- treats malformed or missing envelopes as testcase failure
- does not fall back to legacy raw stdout mode

## Active Verification

The active storage audit after text-cache removal is:

```bash
npm run audit:post-drop
```

It confirms that `testcases.input` and `testcases.output` no longer exist.

The legacy pre-drop audit script is archived under:

- `scripts/archive/migrate/audit-post-migration.ts`

The text-cache reference guard remains active:

```bash
npm run check:no-testcase-text-cache-refs
```

## Performance Harness

The `challenge_detail_*` Artillery scripts under `tests/performance/` are staging measurement tools for challenge-detail response time. They are operational verification tools, not CI blockers.

## Rollout Notes

For slice 5 mixed deploy safety:

1. deploy sandbox first so it accepts `execution_mode = "wrapper"` and unset or empty values
2. smoke test sandbox-new + worker-old on `cpp`, `java`, and `python`
3. deploy worker and API after the smoke test passes
4. monitor for `INVALID_ARGUMENT` errors related to `execution_mode`
5. remove the wire field entirely in the next cleanup slice