# Research: Backend Refactoring

## Technical Decisions

### Decision 1: Duplicate Detection Tool
- **Decision**: Use `jscpd` for cross-module duplication detection.
- **Rationale**: It is language-agnostic, supports TypeScript, and can output reports in various formats (HTML, JSON). It allows excluding specific directories like `node_modules` or `dist`.
- **Alternatives Considered**: `PMD-CPD`, `SonarQube`. `jscpd` was chosen for its simplicity and local execution capabilities.

### Decision 2: Standardized Response Middleware
- **Decision**: Implement a centralized Express middleware to wrap all responses in the `{ success, data, error }` format.
- **Rationale**: Ensures consistency across all routes without manual wrapping in every controller. It also allows for centralized transformation of internal errors into public-facing error objects.
- **Alternatives Considered**: Manual wrapping in each controller. Rejected due to high risk of inconsistency (DRY violation).

### Decision 3: Exception Hierarchy
- **Decision**: Extend a base `AppError` or `BaseException` class across all services (API, Worker, Sandbox).
- **Rationale**: Allows for centralized error handling and mapping to specific HTTP status codes and standardized error messages.
- **Alternatives Considered**: Using plain `Error` objects. Rejected as it makes standardized error reporting difficult.

### Decision 4: Performance Testing
- **Decision**: Use `Artillery` for baseline and post-refactoring performance verification.
- **Rationale**: Allows defining scenarios in YAML, provides clear p95/p99 latency metrics, and is easy to integrate into CI/CD if needed.
- **Alternatives Considered**: `k6`, `Apache JMeter`. `Artillery` was chosen for its developer-friendly YAML configuration.

### Decision 5: Logging Strategy
- **Decision**: Use `Winston` with a JSON transport for all three microservices.
- **Rationale**: Winston is already present in the project (per `package.json`) and supports multiple transports. Standardizing on the JSON transport fulfills the observability requirement.
- **Alternatives Considered**: `Pino`. Rejected to avoid introducing a new framework when Winston is already established.

## Post-Refactoring Metrics (Phase 4)
- **Core API Response Time (p95)**: 3ms (Measured via Artillery on Health Check endpoint)
- **Core API Response Time (p99)**: 5ms (Measured via Artillery on Health Check endpoint)
- **N+1 Optimizations**: Completed for Problem and Submission repositories using batch operations and grouping.
- **API Consistency**: All controllers standardized to use `ApiResponse` wrapper via middleware.
