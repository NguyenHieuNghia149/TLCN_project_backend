import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

describe('docker compose runtime path', () => {
  it('publishes the API port to the host for the manual full-pipeline gate', () => {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const compose = YAML.parse(fs.readFileSync(composePath, 'utf8')) as {
      services?: {
        api?: {
          ports?: string[];
        };
      };
    };

    expect(compose.services?.api?.ports).toContain('3001:3001');
  });

  it('enables database SSL by default for the API runtime', () => {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const compose = YAML.parse(fs.readFileSync(composePath, 'utf8')) as {
      services?: {
        api?: {
          environment?: string[];
        };
      };
    };

    expect(compose.services?.api?.environment).toContain('DB_SSL=${DB_SSL:-true}');
  });

  it('sets the API bcrypt worker threadpool before the container process starts', () => {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const compose = YAML.parse(fs.readFileSync(composePath, 'utf8')) as {
      services?: {
        api?: {
          environment?: string[];
        };
      };
    };

    expect(compose.services?.api?.environment).toContain('UV_THREADPOOL_SIZE=${UV_THREADPOOL_SIZE:-32}');
  });

  it('sets API queue backpressure defaults for load-test safety', () => {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const compose = YAML.parse(fs.readFileSync(composePath, 'utf8')) as {
      services?: {
        api?: {
          environment?: string[];
        };
      };
    };

    expect(compose.services?.api?.environment).toContain('JUDGE_QUEUE_MAX_BACKLOG=${JUDGE_QUEUE_MAX_BACKLOG:-5000}');
  });

  it('bounds API last-login audit writes by default', () => {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const compose = YAML.parse(fs.readFileSync(composePath, 'utf8')) as {
      services?: {
        api?: {
          environment?: string[];
        };
      };
    };

    expect(compose.services?.api?.environment).toContain(
      'AUTH_LAST_LOGIN_AUDIT_CONCURRENCY=${AUTH_LAST_LOGIN_AUDIT_CONCURRENCY:-2}',
    );
    expect(compose.services?.api?.environment).toContain(
      'AUTH_LAST_LOGIN_AUDIT_MAX_PENDING=${AUTH_LAST_LOGIN_AUDIT_MAX_PENDING:-1000}',
    );
  });

  it('does not require refresh-token JWT secrets for the API runtime', () => {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const compose = YAML.parse(fs.readFileSync(composePath, 'utf8')) as {
      services?: {
        api?: {
          environment?: string[];
        };
      };
    };

    expect(compose.services?.api?.environment).toContain('JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}');
    expect(compose.services?.api?.environment).not.toContain('JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}');
  });

  it('builds the API image from the committed dependency lockfile', () => {
    const dockerignore = fs.readFileSync(path.resolve(process.cwd(), '.dockerignore'), 'utf8');
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.api'), 'utf8');

    expect(dockerignore.split(/\r?\n/)).not.toContain('package-lock.json');
    expect(dockerfile).toContain('FROM node:22-alpine3.22 AS builder');
    expect(dockerfile).toContain('FROM node:22-alpine3.22');
    expect(dockerfile).not.toContain('node:20.9.0');
    expect(dockerfile).not.toContain('node:24-alpine3.22');
    expect(dockerfile).not.toContain('alpine3.18');
    expect(dockerfile).toContain('RUN npm ci --ignore-scripts');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
  });

  it('builds the worker image from the committed dependency lockfile', () => {
    const dockerignore = fs.readFileSync(path.resolve(process.cwd(), '.dockerignore'), 'utf8');
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.worker'), 'utf8');
    const lockfileInstallCount = (dockerfile.match(/RUN npm ci --ignore-scripts/g) ?? []).length;

    expect(dockerignore.split(/\r?\n/)).not.toContain('package-lock.json');
    expect(lockfileInstallCount).toBe(1);
    expect(dockerfile).toContain('FROM node:22-alpine3.22 AS builder');
    expect(dockerfile).toContain('FROM node:22-alpine3.22 AS production-deps');
    expect(dockerfile).toContain('FROM node:22-alpine3.22');
    expect(dockerfile).not.toContain('node:20.9.0');
    expect(dockerfile).not.toContain('node:24-alpine3.22');
    expect(dockerfile).not.toContain('alpine3.18');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
    expect(dockerfile).toContain('COPY --from=production-deps /app/node_modules ./node_modules');
    expect(dockerfile).not.toContain('COPY --from=builder /app/package-lock.json ./package-lock.json');
    expect(dockerfile).not.toContain('RUN npm prune --omit=dev --ignore-scripts');
  });

  it('copies the API environment launcher required by the start script', () => {
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.api'), 'utf8');

    expect(dockerfile).toContain('COPY scripts/run-with-env.js ./scripts/run-with-env.js');
  });
});
