# Pre-Merge Full-Server Checklist

This checklist is the merge gate for `refactor/submissions` before merging into `main`.

## Scope

Use this checklist only after the deterministic gates are already clean:

- `npm run verify:release-smoke`
- `npm run check:refactor-guards`
- `npm run check:no-testcase-text-cache-refs`
- `npx tsc -p tsconfig.json --noEmit`
- `npm run build`

Both supported runtime paths now work with the same host API URL: `http://localhost:3001/api`.
Use the local node-process path for fastest debugging. Use Docker Compose when you want multi-service behavior closer to deployment.

## 1. Deterministic Preflight

Run:

```txt
npm run verify:pre-merge-gate
```

Expected:

- all steps pass
- final JSON summary reports `overallStatus: "pass"`

Do not continue if this step fails.

## 2. Choose One Runtime Path

### Path A: Local Node Processes

Prerequisites:

- PostgreSQL target DB is available
- Redis queue/cache are available
- `.env` is configured for the post-drop DB
- built artifacts are present after `npm run build`

Run in separate terminals from `backend/`:

```txt
npm run start:api
npm run start:worker
npm run start:sandbox
```

### Path B: Docker Compose

Run from `backend/`:

```txt
docker compose up --build api worker sandbox redis-queue redis-cache nginx
```

Important:

- the compose path now publishes API port `3001` to the host
- use the same API base URL as the local path: `http://localhost:3001/api`

## 3. Runtime Preflight Checks

Run against the real runtime:

- `GET /health` on `http://localhost:3001/api/health` => `200`
- `GET /api/submissions/queue/status` on `http://localhost:3001/api/submissions/queue/status` => `200`
- sandbox health endpoint remains green during idle startup

If any service fails to boot, capture logs before restarting.

## 4. Manual / Operator E2E Gate

Run:

```txt
npm run verify:full-pipeline:e2e
```

Detailed env and expected outcomes are documented in [full-pipeline-e2e.md](./full-pipeline-e2e.md).

Required pass conditions:

- auth/token resolution succeeds
- accepted submission reaches accepted terminal status
- malicious submission reaches an allowed bounded terminal status (currently `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, or `RUNTIME_ERROR` when the sandbox kills execution before the wrapper envelope is emitted)
- worker consumes both jobs
- SSE reaches terminal status for both flows
- sandbox remains healthy during execution

## 5. Manual Visibility Checks

Check with real HTTP requests or Postman:

- public challenge detail is reachable for a public problem
- private/quarantined challenge is still inaccessible on the public path
- favorite add/list/toggle works for a public problem
- private/quarantined favorite path remains inaccessible

## 6. Restart Smoke

Restart API once, worker once, and sandbox once.
After restart, rerun:

- `GET /health`
- `GET /api/submissions/queue/status`

Expected:

- clean startup
- no bootstrap regression
- no legacy testcase-column assumptions
- no queue/bootstrap/sandbox reconnect regressions

## 7. Failure Triage

If the full-server gate fails, inspect:

- API logs
- worker logs
- sandbox logs
- Redis queue/cache logs
- DB logs

Stop the merge if the failure is not understood.

## 8. Final Signoff Record

Record one final summary before merge:

```txt
checkedAt:
deterministicGate: pass|fail
runtimePath: local-process|docker-compose
api: pass|fail
worker: pass|fail
sandbox: pass|fail
redisQueue: pass|fail
login: pass|fail
publicChallenge: pass|fail
privateChallengeBlocked: pass|fail
favoriteFlow: pass|fail
submissionCreate: pass|fail
submissionSseTerminal: pass|fail
restartSmoke: pass|fail
blockers:
```

Merge to `main` only if:

- deterministic gate passed
- one runtime path passed
- `verify:full-pipeline:e2e` passed
- restart smoke passed
- blockers list is empty


