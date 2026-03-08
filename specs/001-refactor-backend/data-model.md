# Data Model: Backend Refactoring

## Standardized Exception Structure
All internal and external errors MUST follow this object structure to ensure consistency across services.

- `code`: String - Unique identifier for the error type (e.g., `AUTH_ERROR`, `SUBMISSION_TIMEOUT`).
- `message`: String - Human-readable explanation.
- `status`: Number - HTTP status code (for API responses).
- `details`: Object | null - Additional context or validation errors.

## Standardized API Response Wrapper
All successful and failed responses MUST be wrapped in this structure.

- `success`: Boolean - Indicates if the request was successful.
- `data`: Object | Array | null - The payload for successful requests.
- `error`: { code, message, details } | null - The error object for failed requests.

## Standardized Log Structure
All service logs (API, Worker, Sandbox) MUST be emitted in structured JSON format.

- `timestamp`: String - ISO 8601 timestamp.
- `level`: String - Log level (info, error, debug).
- `service`: String - Service name (api, worker, sandbox).
- `message`: String - Log message.
- `context`: Object - Additional key-value pairs for traceability (e.g., `userId`, `submissionId`).
