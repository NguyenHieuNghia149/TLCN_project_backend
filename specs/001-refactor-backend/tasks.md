# Tasks: Backend Refactoring

**Input**: Design documents from `/specs/001-refactor-backend/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Refactoring will be validated using the existing Jest test suite and new performance/duplication baselines.

**Organization**: Tasks are grouped by user story to enable incremental refactoring and validation.

## Phase 1: Setup (Refactoring Tools & Baselines)

**Purpose**: Initialize measurement tools and establish pre-refactoring baselines.

- [x] T001 Install refactoring dependencies: `jscpd` and `artillery`
- [x] T002 Generate baseline code duplication report using `jscpd` for `src/`, `worker/`, and `sandbox/`
- [x] T003 [P] Create performance baseline script `tests/performance/submission_baseline.yml` using `Artillery`
- [x] T004 Run performance baseline and record p95/p99 results in `specs/001-refactor-backend/research.md`

---

## Phase 2: Foundational (Infrastructure Standardization)

**Purpose**: Core error handling, response wrapping, and logging infrastructure.

**⚠️ CRITICAL**: This phase blocks all subsequent refactoring stories.

- [x] T005 Implement base `AppException` and common sub-classes in `src/exceptions/`
- [x] T006 [P] Create `ApiResponse` wrapper utility in `src/utils/response.ts`
- [x] T007 Implement centralized error-handling middleware in `src/middlewares/error.middleware.ts`
- [x] T008 [P] Implement standardized response middleware in `src/middlewares/response.middleware.ts`
- [x] T009 Standardize `Winston` logging configuration with JSON transport in `src/config/logger.ts`
- [x] T010 Apply standardized logging to `worker/worker.server.ts` and `sandbox/sandbox.server.ts`

**Checkpoint**: Infrastructure ready - standardized response/error/logging flow is active.

---

## Phase 3: User Story 1 - Developer Maintenance (Priority: P1) 🎯 MVP

**Goal**: Improve readability and reduce duplication by extracting utilities and decomposing complex services.

**Independent Test**: Code duplication reduced in target files; all existing Jest tests pass.

### Implementation for User Story 1

- [x] T011 [P] [US1] Extract common string and date utilities to `src/utils/common.ts`
- [x] T012 [P] [US1] Extract file-system related logic from Sandbox to `src/utils/fs.ts`
- [x] T013 [US1] Refactor `src/services/submission.service.ts`: decompose `submitCode` and `runCode` logic into smaller private methods
- [x] T014 [US1] Refactor `src/services/exam.service.ts`: simplify complex logic in `syncSession` and `submitExam`
- [x] T015 [US1] Standardize variable and function naming in `src/services/challenge.service.ts`
- [x] T016 [US1] Verify US1 changes by running `npm test` and `jscpd`

**Checkpoint**: Core services are modularized and follow naming standards.

---

## Phase 4: User Story 2 - Reliable System Operation (Priority: P2)

**Goal**: Standardize API responses and optimize database performance.

**Independent Test**: All API responses match `contracts/api-response.json`; performance improvement verified by Artillery.

### Implementation for User Story 2

- [x] T017 [US2] Apply `ApiResponse` wrapper to all controllers in `src/controllers/`
- [x] T018 [P] [US2] Review and optimize N+1 queries in `src/repositories/problem.repository.ts`
- [x] T019 [P] [US2] Review and optimize N+1 queries in `src/repositories/submission.repository.ts`
- [x] T020 [US2] Implement pagination for large datasets in `src/controllers/leaderboard.controller.ts`
- [x] T021 [US2] Run performance tests using `Artillery` to verify SC-003 (>5% improvement)

**Checkpoint**: API is consistent and performance-optimized.

---

## Phase 5: User Story 3 - Future Extension (Priority: P3)

**Goal**: Finalize utility extraction and update documentation for future developers.

**Independent Test**: Developer documentation matches the refactored code structure.

### Implementation for User Story 3

- [x] T022 [P] [US3] Extract any remaining shared logic between Worker and Sandbox to `src/utils/`
- [x] T023 [US3] Update `docs/EXECUTION_FLOW.md` to reflect the refactored judge pipeline
- [x] T024 [US3] Update `README.md` with instructions on how to use standardized exceptions and responses

**Checkpoint**: System is fully documented and ready for extension.

---

## Phase N: Polish & Verification

**Purpose**: Final quality gates and measurement validation.

- [ ] T025 [P] Run final duplication report to verify SC-001 (>20% reduction)
- [ ] T026 Run final linting and formatting: `npm run lint:fix && npm run format`
- [ ] T027 Final execution of the full Jest test suite to ensure zero regressions
- [ ] T028 Update `specs/001-refactor-backend/research.md` with final metrics
- [ ] T029 Configure `@/` path aliases across API, Worker, and Sandbox. Update build scripts and ensure `src/register-aliases.js` is leveraged in all entry points.
- [ ] T030 Create centralized error code registry: Create file:src/enums/error-codes.ts.Define standardized error codes for API responses.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on T001 (Tools). Blocks all User Stories.
- **User Stories (Phase 3+)**: All depend on Phase 2 completion.
  - US1 (Maintenance) is the highest priority MVP.
  - US2 (Reliability) and US3 (Extension) can run in parallel if US1 is stable.
- **Polish (Final Phase)**: Depends on all user stories being complete.

### Parallel Opportunities

- T003 and T002 (Baseline measurements).
- T006, T008, T009 (Infrastructure components).
- T011, T012 (Utility extraction).
- T018, T019 (Repository optimizations).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and Foundational phases.
2. Focus on US1: Extracting utilities and simplifying `submission.service.ts`.
3. Validate with existing tests and `jscpd`.

### Incremental Delivery

- Each phase delivers a measurable improvement (Standardization -> Readability -> Performance).
- Commit after each task group (e.g., "refactor: extract fs utilities").
- Run `npm test` after every major task.
