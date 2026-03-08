---
description: This workflow defines the standard process for implementing backend features in the system.  The goal is to ensure that every feature is implemented in a **structured, maintainable, and scalable way** while following the system architecture rules.
---

# Backend Feature Development Workflow

This workflow defines the standard process for implementing backend features in the system.

The goal is to ensure that every feature is implemented in a **structured, maintainable, and scalable way** while following the system architecture rules.

---

# 1. Objective

The purpose of this workflow is to ensure that:

- Backend features follow the defined architecture.
- Code is maintainable and modular.
- Business logic is separated from infrastructure.
- All new features include proper testing and validation.

---

# 2. Architecture Requirements

All features must follow the required backend architecture.

Required layers:

Controller → Service → Repository → Database

Responsibilities:

Controller

- Handle HTTP request and response.
- Validate incoming data.
- Call service layer.

Service

- Implement business logic.
- Coordinate operations between repositories and external services.

Repository

- Handle database queries.
- Abstract database access.

Database

- Store persistent data.

Rules:

- Controllers must not contain business logic.
- Services must not depend on HTTP request objects.
- Repositories must be the only layer interacting with the database.

---

# 3. Feature Development Workflow

## Step 1 — Understand the Feature Requirements

Before writing code:

Tasks:

- Read the feature specification.
- Identify affected modules.
- Identify required API endpoints.
- Identify database schema changes.
- Identify potential background jobs.

Output:

- Feature summary
- List of affected modules
- Required API endpoints

---

## Step 2 — System Design

Design the feature architecture before implementation.

Tasks:

- Identify controller functions.
- Identify service responsibilities.
- Identify repository operations.
- Define data flow.
- Identify integration points.

Output:

- Architecture outline
- API design
- Data flow description

---

## Step 3 — Database Design

If the feature requires database changes:

Tasks:

- Define new tables or columns.
- Update schema files.
- Add required indexes.

Schema location:

src/database/schema/

Best practices:

- Use normalized database structure.
- Avoid redundant data.
- Add indexes for frequently queried fields.

Output:

- Updated schema definition

---

## Step 4 — API Implementation

Implement the API following the architecture rules.

Implementation order:

1. Create repository methods.
2. Implement service logic.
3. Implement controller endpoints.
4. Add route definitions.
5. Add request validation.

Example structure:

src/modules/problem/

controllers/
services/
repositories/
validators/
routes/

Rules:

- Controller must only orchestrate requests.
- Service must contain all business logic.
- Repository must contain database queries.

---

## Step 5 — Background Jobs (If Required)

If the feature includes long-running tasks:

Examples:

- code execution
- leaderboard calculation
- plagiarism detection
- batch processing

Tasks:

- Define queue job
- Implement worker logic
- Ensure asynchronous execution

Queue payload must include required identifiers only.

---

## Step 6 — Input Validation

All APIs must validate incoming data.

Validation rules:

- Validate request body
- Validate query parameters
- Validate path parameters

Recommended approach:

Use schema-based validation (e.g., Zod or Joi).

Invalid input must return standardized error responses.

---

## Step 7 — Error Handling

All services must handle errors properly.

Requirements:

- Use consistent error structure
- Avoid exposing internal system details
- Log internal errors

Standard error response format:

{
"success": false,
"data": null,
"error": {
"code": "ERROR_CODE",
"message": "Human readable message"
}
}

---

## Step 8 — Testing

Every new feature must include tests.

Required tests:

Unit Tests:

- service logic
- utility functions
- validation logic

Integration Tests:

- API endpoints
- repository queries
- database interactions

Tests must verify both success and failure scenarios.

---

## Step 9 — Logging and Observability

Add logging for critical operations.

Required logging targets:

- API requests
- service errors
- background job execution

Logs must be structured and searchable.

---

## Step 10 — Code Quality Review

Before merging code:

Verify the following:

- Code follows architecture rules
- Business logic is in services
- No database access in controllers
- Functions are small and readable
- Naming conventions are consistent

---

## Step 11 — Commit Standards

All commits must follow structured commit messages.

Format:

<type>(<module>): short summary

Example:

feat(problem): implement problem creation API

Commit message must include:

- Purpose of the feature
- Important implementation details
- Related modules

---

# 4. Completion Criteria

A backend feature is considered complete when:

- Feature logic is fully implemented
- API endpoints are functional
- Database changes are applied
- Tests pass successfully
- Code review is completed
- Documentation is updated

---

# 5. Expected Outcome

After following this workflow, the system should have:

- Clean and modular feature implementation
- Clear separation of concerns
- High code maintainability
