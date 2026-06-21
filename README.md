# Backend Service - Online Judge Platform

## Project Introduction

This is the Backend system for an Online Judge platform, designed to facilitate learning, practicing, and competing in algorithmic programming. The system provides:

- **Problem & Contest Management**: Manages a rich repository of problems and organizes real-time contests.
- **Auto-grading System**: Integrates Worker & Sandbox services to safely compile and execute user code, supporting multiple programming languages.
- **Leaderboard**: Real-time scoring and ranking.
- **Community**: System for comments and discussing solutions.

The Backend is built on **Node.js** and **Express**, utilizing a modular architecture to ensure scalability and performance.

This is the backend service for the project, built with Node.js, Express, and TypeScript. It handles the core business logic, database interactions, authentication, and connects with the worker service for code execution.

## System Architecture

The system follows a modular architecture using the **Controller-Service-Repository** pattern.

```mermaid
graph TD
    Client["Client / Frontend"] -->|HTTP/REST| API["Backend API (Express)"]
    API -->|Read/Write| DB[("PostgreSQL")]
    API -->|Queue jobs| RedisQueue[("Redis queue / BullMQ")]
    API -->|Store Media| Cloud[("Cloudinary")]

    subgraph Execution Engine
        RedisQueue -->|Job Queue| Worker["Worker Service"]
        Worker -->|Execute| Sandbox["Sandbox Environment"]
        Sandbox -->|Result| Worker
    end

    Worker -->|Publish Status| RedisCache[("Redis cache / PubSub")]
    RedisCache -->|SSE stream| API
    API -->|/api/submissions/stream/:submissionId| Client
```

## Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Queues**: [Redis](https://redis.io/) / BullMQ
- **Submission Status Stream**: Redis Pub/Sub + API SSE (`/api/submissions/stream/:submissionId`)
- **WebSocket Notifications**: [Socket.IO](https://socket.io/)
- **Infrastructure**: Docker, Docker Compose

## Getting Started

### Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Docker](https://www.docker.com/) & Docker Compose
- [PostgreSQL](https://www.postgresql.org/) (or use the Docker container)
- [Redis](https://redis.io/) (or use the Docker container)

### Installation

1.  **Clone the repository**

    ```bash
    git clone <repository_url>
    cd project/backend
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory. You can copy the example config (if available) or set the following variables:

    ```env
    PORT=3000
    DATABASE_URL=postgresql://user:password@localhost:5432/dbname
    REDIS_QUEUE_URL=redis://localhost:6379
    REDIS_CACHE_URL=redis://localhost:6380
    # Optional legacy fallback used only where runtime factories allow it:
    # REDIS_URL=redis://localhost:6379
    # Add other necessary variables like JWT_SECRET, CLOUDINARY_*, etc.
    ```

4.  **Database Migration**
    Initialize the database schema:
    ```bash
    npm run db:generate
    npm run db:migrate
    ```

### Running the Application

You can run the services individually or all together.

- **Development Mode (All Services)** (API + Worker + Sandbox):

  ```bash
  npm run dev:all
  ```

- **API Only**:

  ```bash
  npm run dev
  ```

- **Worker Service Only**:

  ```bash
  npm run dev:worker
  ```

- **Sandbox Service Only**:
  ```bash
  npm run dev:sandbox
  ```

## Project Structure

```text
backend/
|-- apps/
|   |-- api/        # API Service (Express)
|   |   |-- src/
|   |   |   |-- config/       # Configuration files
|   |   |   |-- controllers/  # Request handlers
|   |   |   |-- services/     # Business logic layer
|   |   |   |-- repositories/ # API-domain database access layer
|   |   |   |-- routes/       # API route definitions
|   |   |   |-- middlewares/  # Express middlewares
|   |   |   |-- utils/        # Utility functions
|   |   |   `-- index.ts      # Application entry point
|   |   `-- package.json
|   |-- worker/     # Background worker for code execution
|   |   `-- package.json
|   `-- sandbox/    # Isolated environment for running user code
|       `-- package.json
|-- packages/
|   `-- shared/     # Shared code across services
|       |-- db/
|       |   |-- migrations/   # Drizzle migrations
|       |   `-- schema/       # Canonical Drizzle schemas and relations
|       `-- types/            # Shared TypeScript types
`-- package.json
```

## Scripts

- `npm run build`: Build the project (TypeScript to JavaScript).
- `npm run start`: Run the built project in production.
- `npm run lint`: Lint the code using ESLint.
- `npm run format`: Format the code using Prettier.
- `npm test`: Run tests using Jest.

## Development Standards

### Standardized API Responses

All API responses follow a consistent JSON structure, handled automatically by `responseMiddleware`:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

In controllers, simply return your data using `res.json(data)`.

### Error Handling

Use `AppException` (or its subclasses) to throw errors. These are automatically caught by the global `errorMiddleware` and returned as standardized error responses.

```typescript
throw new AppException('Resource not found', 404, 'NOT_FOUND');
```

### Path Aliases

Use the configured `@backend/...` aliases for maintained cross-package and cross-app imports. For API-local imports, prefer the explicit `@backend/api/*` alias; for shared code, use `@backend/shared/*`.

```typescript
import { UserService } from '@backend/api/services/user.service';
import { JudgeUtils } from '@backend/shared/utils';
```

### Core Utilities

- **JudgeUtils**: Status determination and score calculation logic.
- **StringUtils**: String manipulation including `trimOutput`.
- **DateUtils**: Date formatting and validation.
- **FsUtils**: Standardized file system operations.
