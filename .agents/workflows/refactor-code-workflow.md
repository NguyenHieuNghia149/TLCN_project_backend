---
description: This document defines the standard workflow for refactoring code in the backend system. The goal of refactoring is to improve code structure, readability, and maintainability without changing the external behavior of the system
---

# Code Refactoring Workflow

This document defines the standard workflow for refactoring code in the backend system.
The goal of refactoring is to improve code structure, readability, and maintainability **without changing the external behavior of the system**.

---

# 1. Objective

Refactoring aims to:

- Improve code readability
- Reduce complexity
- Eliminate duplicate logic
- Enforce architecture rules
- Improve maintainability
- Preserve existing behavior

Refactoring must **not introduce functional changes** unless explicitly required.

---

# 2. Refactoring Principles

All refactoring must follow these principles:

- Preserve existing system behavior
- Follow the Controller → Service → Repository architecture
- Avoid introducing unnecessary abstractions
- Prefer small, focused functions
- Maintain backward compatibility
- Improve naming clarity

---

# 3. Refactoring Workflow

## Step 1 — Understand the Existing Code

Before making any changes, analyze the current implementation.

Tasks:

- Identify the purpose of the module or function
- Understand input and output behavior
- Identify dependencies with other modules
- Analyze data flow and side effects

Output:

- A clear summary of current functionality
- Identification of potential refactoring targets

---

## Step 2 — Identify Refactoring Targets

Look for code smells and structural problems.

Common issues include:

- Large functions
- Duplicate code
- Tight coupling between modules
- Business logic inside controllers
- Database logic outside repositories
- Hardcoded values
- Poor naming conventions

Example problems:

```
- Controller contains business logic
- Repeated database queries
- Deep nested conditions
- Mixed responsibilities in services
```

---

## Step 3 — Ensure Test Coverage

Before refactoring:

- Verify existing tests cover the current behavior
- Add missing tests if necessary

Required tests:

Unit tests:

- service logic
- utility functions
- validation logic

Integration tests:

- API endpoints
- database queries

This step ensures behavior can be validated after refactoring.

---

## Step 4 — Apply Structural Refactoring

Apply structural improvements while preserving functionality.

Common refactoring techniques include:

### Extract Function

Break large functions into smaller reusable functions.

Example:

Before:

```
processSubmission()
```

After:

```
validateSubmission()
saveSubmission()
enqueueSubmissionJob()
```

---

### Extract Service

Move business logic from controllers into services.

Correct structure:

```
Controller → Service
```

---

### Extract Repository

Move database logic from services into repositories.

Correct structure:

```
Service → Repository
```

---

### Remove Duplicate Code

Replace repeated logic with shared utilities or helper functions.

---

## Step 5 — Improve Naming

Improve clarity of function and variable names.

Bad examples:

```
handleData()
process()
doTask()
```

Better examples:

```
validateSubmissionInput()
calculateContestScore()
enqueueJudgeJob()
```

Naming should clearly reflect the responsibility of the function.

---

## Step 6 — Simplify Logic

Reduce complexity and improve readability.

Techniques:

- Replace nested conditions with guard clauses
- Extract complex conditions
- Split large conditional blocks

Example:

Before:

```
if (user) {
  if (user.isAdmin) {
    if (user.isActive) {
```

After:

```
if (!user) return
if (!user.isAdmin) return
if (!user.isActive) return
```

---

## Step 7 — Ensure Architecture Compliance

Verify that the code follows the required architecture.

Required layers:

```
Controller
Service
Repository
Database
```

Rules:

- Controllers must not access the database
- Services must not depend on HTTP request objects
- Repositories must handle database queries

---

## Step 8 — Performance Improvements (Optional)

If necessary, improve performance during refactoring.

Examples:

- Prevent N+1 database queries
- Batch database operations
- Introduce caching for frequently accessed data
- Reduce repeated calculations

---

## Step 9 — Validate Refactor

After refactoring:

- Run all existing tests
- Verify API responses remain unchanged
- Confirm database operations work correctly

Ensure that:

- System behavior is preserved
- No regression bugs are introduced

---

## Step 10 — Code Review

Before merging refactored code:

Review checklist:

- Code readability improved
- Functions are small and focused
- Architecture rules are respected
- Duplicate logic removed
- Naming conventions are consistent

---

## Step 11 — Commit Refactor Changes

Use clear commit messages when refactoring.

Commit format:

```
refactor(<module>): short summary
```

Example:

```
refactor(submission): extract judging logic into service
```

Commit message must explain:

- What was refactored
- Why the refactor was necessary
- Any architectural improvements

---

# 4. Refactoring Constraints

During refactoring:

The following actions are **not allowed**:

- Changing API response structures
- Modifying database schema without migration
- Introducing breaking changes without versioning
- Adding new features unrelated to the refactor

---

# 5. Expected Outcome

After refactoring, the system should have:

- Cleaner code structure
- Improved readability
- Better architecture separation
- Reduced complexity
- Easier long-term maintenance
