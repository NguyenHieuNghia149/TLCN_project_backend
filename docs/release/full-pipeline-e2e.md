# Full Pipeline E2E Guide

This document explains how to run `apps/api/tests/e2e/full_pipeline.test.ts` as the manual/operator merge gate.

## Command

Run from `backend/`:

```txt
npm run verify:full-pipeline:e2e
```

This command executes the TypeScript file directly with `ts-node`. It is intentionally not run through Jest because the file is an operator script, not a normal Jest suite.

## Required Environment Variables

### Always required

- `E2E_GOLDEN_PROBLEM_ID`

### Required unless `E2E_ACCESS_TOKEN` is provided

- `E2E_EMAIL`
- `E2E_PASSWORD`

### Optional

- `E2E_ACCESS_TOKEN`
  - if set, the script skips login and uses this bearer token directly
- `E2E_MALICIOUS_PROBLEM_ID`
  - defaults to `E2E_GOLDEN_PROBLEM_ID` if omitted
  - do not leave this as a placeholder value
- `E2E_BASE_URL`
  - defaults to `http://localhost:3001/api`
- `E2E_TIMEOUT_MS`
  - defaults to `15000`

## Expected Problem Selection

Use a known function-style problem that is valid on the post-drop DB and safe for repeated submission tests.

The selected problem must:

- accept standard source submission through `/api/submissions`
- be public and reachable on the current target runtime
- be compatible with the bundled `GOLDEN_CPP` implementation in the test

The malicious path uses the bundled infinite-loop sample and should target the same problem unless you have a dedicated safe test problem.

## Expected Outcomes

### Golden path

Expected:

- submission creation returns `201`
- initial status is `PENDING`
- SSE connects successfully
- at least one SSE status update is observed before terminal status
- terminal status is `ACCEPTED`

### Malicious path

Expected:

- submission creation returns `201`
- SSE connects successfully
- at least one SSE status update is observed before terminal status
- terminal status is one of:
  - `TIME_LIMIT_EXCEEDED`
  - `MEMORY_LIMIT_EXCEEDED`

Any other terminal outcome is a merge blocker until explained.

## Runtime Preconditions

Before running the test:

- API is already up and healthy on `http://localhost:3001/api/health`
- worker is already up and connected to Redis/sandbox
- sandbox is already up and healthy
- queue status endpoint responds with `200`

## Failure Triage

If the test fails, inspect in this order:

1. API logs
2. worker logs
3. sandbox logs
4. Redis queue/cache state
5. DB logs

Useful failure categories:

- login/token failure
- submission creation failure
- queue consumption stalled
- SSE never reaches terminal status
- sandbox execution failure
- malicious run did not terminate within bounded status
- stale response-envelope assumptions in the operator script

## Notes

- This is intentionally an operator-run runtime check, not part of deterministic CI.
- Use this together with [pre-merge-full-server-checklist.md](./pre-merge-full-server-checklist.md).


