# Function-Signature-Only Judge

## Overview

Backend now judges problems in one mode only: `function_signature`.

Users do not write full stdin/stdout programs anymore for supported problems. They implement the problem logic inside a language-specific `Solution` template, and the server generates the execution harness that:

- parses structured testcase JSON
- calls the target function on `Solution`
- measures only the user function runtime
- prints a wrapper envelope in JSON

Supported submission languages are:

- `cpp`
- `java`
- `python`

## Function Signature AST

Each problem stores a required `functionSignature` JSON AST in `problems.function_signature`.

Shape:

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

Execution source of truth lives in structured JSON columns:

- `testcases.input_json`
- `testcases.output_json`

Text fields remain stored only as cached display values:

- `input`: one argument per line, format `argName: value`
- `output`: `JSON.stringify(outputJson)`

Example:

```text
nums: [1, 2, 3]
target: 5
```

## JSON-First Read Model

Challenge and testcase read models are JSON-first. Responses keep both the structured values and the cached text fields:

```ts
{
  inputJson: Record<string, unknown>; // source of truth
  outputJson: unknown;                // source of truth
  input: string;                      // cached display only
  output: string;                     // cached display only
}
```

Important rules:

- execution never reads `input` or `output`
- repositories rebuild cached text from JSON when writing
- service and worker code must use shared helpers instead of inline formatting
- cached text may be stale historically, but it cannot affect judging

The shared helpers are:

- `buildFunctionInputDisplayValue(functionSignature, inputJson)`
- `canonicalizeStructuredValue(outputJson)`

## Read Model

Problem and challenge detail responses expose:

```ts
{
  functionSignature: AST;
  starterCodeByLanguage: {
    cpp: string;
    java: string;
    python: string;
  };
}
```

Starter code is generated on the fly from the AST. It is not stored in the database.

If a problem row is missing `functionSignature`, the API logs the `problemId` and returns `500` with the generic message:

```text
problem configuration invalid
```

## Queue And Execution Pipeline

New jobs are wrapper-only.

Queue payload contract:

```ts
{
  functionSignature: AST;
  executionMode: "wrapper";
  testcases: Array<{
    inputJson: Record<string, unknown>;
    outputJson: unknown;
  }>;
}
```

Worker behavior:

- generates full executable source with `wrapperGenerator.ts`
- sends `JSON.stringify(inputJson)` to sandbox stdin
- sends `JSON.stringify(outputJson)` as expected output
- derives any display text from JSON via shared helpers
- always sets `execution_mode = "wrapper"` on gRPC

Sandbox behavior:

- accepts only `execution_mode = "wrapper"`
- reads the last non-empty stdout line as the wrapper envelope
- requires this exact contract:

```json
{"actual_output": <json-value>, "time_taken_ms": <non-negative number>}
```

- compares semantic output with JSON parsing + deep equality
- treats malformed or missing envelopes as testcase failure
- does not fall back to legacy raw stdout mode

## Migration State

This repository state is the final function-signature-only state.

Operational migration history is kept under:

- `scripts/archive/migrate/`

The active post-cutover verification command is:

```bash
npm run audit:post-migration
```

It checks:

- `problems.function_signature IS NOT NULL`
- `testcases.input_json IS NOT NULL`
- `testcases.output_json IS NOT NULL`
- `problems.judge_mode` no longer exists

## Rollout Notes

For deployments that still need the historical migration story:

1. verify pre-cutover backfill on the archived scripts
2. deploy code before dropping `judge_mode`
3. run the irreversible DB migration
4. run `npm run audit:post-migration`
5. run smoke and E2E for `cpp`, `java`, and `python`
