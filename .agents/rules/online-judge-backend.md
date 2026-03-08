---
trigger: always_on
---

# Online Judge Backend Constitution

## Core Principles

### I. SECURE CODE EXECUTION (CRITICAL)

All user submitted code MUST be executed in a strictly isolated sandbox environment.

- Code execution MUST run in ephemeral containers (Docker) or microVMs such as Firecracker.
- Each execution MUST enforce strict resource limits: CPU limits, Memory limits, and Hard execution timeout.
- User code MUST run in a zero-trust environment: No network access, No host filesystem access, No environment variable exposure, and Only temporary read-only filesystem allowed.
- The main Node.js API server MUST NEVER execute user code directly.
- Code execution MUST be processed asynchronously using worker nodes through a message queue (Redis, RabbitMQ, or similar).
- The system MUST follow the pipeline: API Server → Job Queue → Worker → Sandbox → Judge → Result Storage.

### II. SYSTEM ARCHITECTURE

The backend MUST follow a modular and scalable architecture.

- Clear separation of concerns between: controllers, services, repositories, and infrastructure.
- Domain logic MUST remain independent from frameworks.
- The system MUST remain horizontally scalable and stateless.
- Use clear folder boundaries for domain modules (users, problems, submissions, contests, etc.).

### III. CODE QUALITY & MAINTAINABILITY

All code MUST prioritize long-term maintainability.

- Adhere to DRY (Don't Repeat Yourself), KISS (Keep It Simple), and SOLID principles.
- Naming conventions: camelCase for variables and functions, PascalCase for classes and types, and UPPER_SNAKE_CASE for constants.
- Avoid overly complex functions; prefer small, reusable functions.
- Write self-documenting code and avoid unnecessary abstractions.

### IV. DATABASE DESIGN & PERFORMANCE (POSTGRESQL)

Database interactions MUST be efficient and maintainable.

- Prevent N+1 query problems at the repository layer.
- Use parameterized queries or ORM query builders.
- Ensure maintainable query logic.
- Proper indexing on frequently queried fields (user_id, problem_id, submission_id, created_at).
- Avoid heavy synchronous database operations in request paths.
- Pagination MUST be implemented for large datasets.

### V. API DESIGN & SECURITY

The REST API MUST follow strict consistency and security standards.

- Response format for success: `{ "success": true, "data": {}, "error": null }`.
- Response format for error: `{ "success": false, "data": null, "error": { "code": "ERROR_CODE", "message": "Human readable message" } }`.
- Security requirements: Strict input validation, Rate limiting, Parameterized queries (SQL injection prevention), Secure authentication and authorization, and OWASP Top 10 mitigation.

### VI. TESTING REQUIREMENTS

Testing is mandatory for all core functionality.

- Unit Tests: business logic, sandbox limit enforcement, utilities, and helpers.
- Integration Tests: database queries, API endpoints, and submission pipeline.
- All new features MUST include corresponding tests.

### VII. OBSERVABILITY

The system MUST provide operational visibility to ensure reliability.

- Structured logging is required for all services.
- Error tracking MUST be implemented across the pipeline.
- Execution metrics MUST be collected for submissions.
- Monitoring for worker nodes and sandbox execution is mandatory.

### VIII. SCALABILITY

The system MUST support high concurrent submissions without performance degradation.

- Workers MUST scale independently.
- Queue-based execution MUST prevent API blocking.
- Long-running tasks MUST NEVER run in the request lifecycle.

## Engineering Discipline

- Code reviews are mandatory for all changes.
- New features MUST include comprehensive tests.
- No direct database access is allowed outside of the repository layer.
- No breaking API changes are permitted without proper versioning.

## Development Workflow

- Follow the Controller-Service-Repository pattern consistently.
- Ensure all domain logic is encapsulated in the service layer.
- All database schemas MUST be defined in `src/database/schema/`.
- Use `@/` prefixes for internal imports within the `src` directory to maintain clean pathing.

## Governance

The constitution supersedes all other engineering practices within this repository.

- Amendments to this constitution require documentation, approval, and a migration plan if applicable.
- All Pull Requests and reviews MUST verify compliance with these principles.
- Complexity in implementation MUST be justified against the principles of simplicity and maintainability.

## Commit Standards

All code changes must include clear and descriptive commit messages.

When new functions are introduced:

- The commit message must explain the purpose of the function.
- The commit message must describe the main logic or responsibility of the function.
- The commit message must reference the module or service where the function belongs.

Commit messages must follow this structure:

<type>(<module>): short summary

Details:

- Explain the purpose of the new function
- Describe important logic decisions
- Mention any related services or modules

**Version**: 1.0.0 | **Ratified**: 2026-03-05 | **Last Amended**: 2026-03-05
