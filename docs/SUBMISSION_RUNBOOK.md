# Submission Runbook

## Purpose

This runbook is for debugging and operating the submission pipeline in local and pre-merge
environments.

Use this document when:

- a submission is stuck in `PENDING`
- a submission reaches `SYSTEM_ERROR`
- SSE does not emit terminal updates
- nginx returns `502` for submission/auth routes
- a merge changed backend runtime behavior and you need to validate the full path again

For architecture and component responsibilities, see
`docs/SUBMISSION_ARCHITECTURE.md`.

## Fast Health Checklist

### Deterministic verification

Run these from [backend](/D:/Workspace/TLCN/project/backend):

```bash
npm run verify:pre-merge-gate
npm run verify:full-pipeline:e2e
```

What they prove:

- post-migration DB invariants still hold
- HTTP submission/challenge/favorite boundaries still work
- queue + worker + sandbox + SSE complete the Golden Path

### Runtime health endpoints

Direct API:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/submissions/queue/status
```

Through nginx:

```bash
curl http://localhost/api/health
curl http://localhost/api/submissions/queue/status
```

Sandbox:

```bash
curl http://localhost:4000/health
```

Expected baseline:

- API health returns `200`
- queue status returns `200` with `isHealthy: true`
- sandbox health returns `200`

## Core Runtime Pieces To Check

Runtime stack:

- `api`
- `worker`
- `sandbox`
- `nginx`
- `redis-queue`
- `redis-cache`

Container overview:

```bash
docker compose -f D:\Workspace\TLCN\project\backend\docker-compose.yml ps
```

Important operational fact:

- after code changes, `api`, `worker`, and `sandbox` must be rebuilt/recreated together
- stale runtime containers can make `main` look broken even when the repo is correct

Recommended refresh command:

```bash
docker compose -f D:\Workspace\TLCN\project\backend\docker-compose.yml up -d --build api worker sandbox nginx
```

## Golden Path Manual Check

### 1. Login

Verify auth first:

```bash
curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"<email>\",\"password\":\"<password>\"}"
```

Expected result:

- `200` with access token for valid credentials
- `401` for invalid credentials

### 2. Create a submission

Example Two Sum payload:

```json
{
  "sourceCode": "#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(const vector<int>& nums, int target) {\n        unordered_map<int, int> map;\n        for (int i = 0; i < nums.size(); i++) {\n            map[nums[i]] = i;\n        }\n        for (int i = 0; i < nums.size(); i++) {\n            int dif = target - nums[i];\n            if (map.count(dif) && map[dif] != i) {\n                return {i, map[dif]};\n            }\n        }\n        return {};\n    }\n};\n",
  "language": "cpp",
  "problemId": "0f465ec8-b3a7-402e-8d5a-a7e99a2f37cb"
}
```

Submit:

```bash
curl -X POST http://localhost:3001/api/submissions ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d @body.json
```

Expected result:

- `201`
- response contains `submissionId`
- initial status is `PENDING`

### 3. Observe progress over SSE

```bash
curl -N "http://localhost:3001/api/submissions/stream/<submissionId>?token=<token>"
```

Expected sequence:

- stream connects successfully
- `RUNNING` arrives
- one terminal status arrives
- connection closes after terminal status

### 4. Check persisted result

```bash
curl http://localhost:3001/api/submissions/<submissionId> ^
  -H "Authorization: Bearer <token>"
```

Expected result:

- persisted status matches the terminal SSE status for normal `SUBMISSION`
- `result.results` contains testcase rows with display-oriented `input` and `expected`

## Common Failure Modes

### 1. `SYSTEM_ERROR` in full pipeline right after merge

Typical symptom:

- `npm run verify:full-pipeline:e2e` fails on the Golden Path
- worker eventually marks the submission as `SYSTEM_ERROR`

Most likely cause:

- runtime services are stale and were not rebuilt from the current branch

Check:

```bash
docker compose -f D:\Workspace\TLCN\project\backend\docker-compose.yml ps
```

Recovery:

```bash
docker compose -f D:\Workspace\TLCN\project\backend\docker-compose.yml up -d --build api worker sandbox nginx
npm run verify:full-pipeline:e2e
```

### 2. nginx returns `502 Bad Gateway`

Typical symptom:

- `POST /api/auth/login` or `POST /api/submissions` through `localhost` or the nginx domain returns `502`

Meaning:

- nginx cannot reach the upstream service
- this is not usually a submission-logic bug

Check:

```bash
docker compose -f D:\Workspace\TLCN\project\backend\docker-compose.yml ps
docker logs backend-nginx-1 --since 10m
```

Recovery:

```bash
docker compose -f D:\Workspace\TLCN\project\backend\docker-compose.yml up -d --build api worker sandbox nginx
```

Notes:

- nginx is configured for dynamic Docker DNS resolution
- if the upstream is still down after rebuild, investigate the `api` container directly

### 3. Submission stuck in `PENDING`

Typical causes:

- worker is down
- queue Redis is unhealthy
- enqueue failed and queue position information is stale

Check:

```bash
curl http://localhost:3001/api/submissions/queue/status
docker logs backend-worker-1 --since 10m
docker logs backend-worker-2 --since 10m
```

What to look for:

- queue health false
- no worker startup log
- repeated BullMQ failures

### 4. SSE connects but no terminal status arrives

Check:

- worker logs for execution/finalization failures
- API logs for SSE subscription issues
- Redis pubsub health

Useful commands:

```bash
docker logs backend-api-1 --since 10m
docker logs backend-worker-1 --since 10m
docker logs backend-worker-2 --since 10m
```

Remember:

- SSE auth can use `Authorization: Bearer ...` or `?token=...`
- the stream is expected to end after the first terminal status

### 5. C++ submission fails even though logic is correct

Two common causes:

#### Missing language-library include

The wrapper does not auto-import arbitrary STL headers.

Example:

- using `unordered_map` requires `#include <unordered_map>`

#### Wrong argument mutability

The wrapper passes parsed inputs as `const` values.

For array inputs, solutions should usually accept:

```cpp
const std::vector<int>& nums
```

not:

```cpp
std::vector<int>& nums
```

Otherwise the compile step can fail with a reference binding error.

### 6. Compile failure reported from the sandbox

Expected behavior now:

- compiler stderr is classified as `COMPILATION_ERROR`
- not as `RUNTIME_ERROR`

If you suspect misclassification:

```bash
docker logs backend-sandbox-1 --since 10m
docker logs backend-worker-1 --since 10m
```

Check whether:

- the sandbox returned compiler-style stderr
- the worker received a mapped `COMPILATION_ERROR`

### 7. Submission request rejected before queueing

Typical causes:

- unsupported language
- problem missing `functionSignature`
- testcase rows missing `inputJson` or `outputJson`

These are configuration failures, not user-code failures.

Check:

- API response body
- API logs
- problem/testcase data in PostgreSQL

## Logging Guide

### API logs

```bash
docker logs backend-api-1 --since 10m
```

Use for:

- request boundary behavior
- SSE subscription lifecycle
- DB/bootstrap issues

Security expectation:

- request validation logs should no longer dump plaintext passwords or full submission bodies

### Worker logs

```bash
docker logs backend-worker-1 --since 10m
docker logs backend-worker-2 --since 10m
```

Use for:

- job pickup
- retry exhaustion
- sandbox request failures
- forced `SYSTEM_ERROR`

### Sandbox logs

```bash
docker logs backend-sandbox-1 --since 10m
```

Use for:

- gRPC request receipt
- compile/runtime execution errors
- sandbox-level crashes

## DB and Post-Migration Checks

The submission flow assumes the post-drop schema is already in place.

Run:

```bash
npm run verify:post-migration
```

Key invariants:

- testcase text cache columns are gone
- `input_json` and `output_json` are populated
- `problem.functionSignature` is populated
- quarantined unsupported problems remain private

If these fail, do not debug the submission runtime in isolation first. Fix the data/runtime preconditions.

## Release and Merge Checklist

Before merging or signing off a backend submission change:

1. run `npm run verify:pre-merge-gate`
2. rebuild the runtime stack:
   `docker compose -f D:\Workspace\TLCN\project\backend\docker-compose.yml up -d --build api worker sandbox nginx`
3. run `npm run verify:full-pipeline:e2e`
4. smoke nginx/localhost boundary:
   - `GET /api/submissions/queue/status` -> `200`
   - login with invalid credentials -> `401`
5. inspect recent API logs to ensure no sensitive request payloads are being logged

## Low-Priority Environment Cleanup

Not a submission blocker, but useful during local maintenance:

- `docker compose ... down --remove-orphans` to clear old containers
- `docker builder prune -a` when build cache grows too large
- `docker system df -v` to inspect Docker disk usage
