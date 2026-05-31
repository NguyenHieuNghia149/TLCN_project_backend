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
    const compose = YAML.parse(fs.readFileSync(path.resolve(process.cwd(), 'docker-compose.yml'), 'utf8')) as {
      services?: {
        api?: {
          build?: {
            dockerfile?: string;
            target?: string;
          };
        };
      };
    };
    const dockerignore = fs.readFileSync(path.resolve(process.cwd(), '.dockerignore'), 'utf8');
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.backend'), 'utf8');

    expect(compose.services?.api?.build?.dockerfile).toBe('docker/Dockerfile.backend');
    expect(compose.services?.api?.build?.target).toBe('api');
    expect(dockerignore.split(/\r?\n/)).not.toContain('package-lock.json');
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS node-runtime');
    expect(dockerfile).toContain('FROM node:22-trixie-slim AS shared-builder');
    expect(dockerfile).toContain('FROM gcr.io/distroless/cc-debian12 AS api');
    expect(dockerfile).toContain('COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node');
    expect(dockerfile).not.toContain('FROM gcr.io/distroless/nodejs22-debian12 AS api');
    expect(dockerfile).not.toContain('FROM node:22-trixie-slim AS api');
    expect(dockerfile).not.toContain('node:20.9.0');
    expect(dockerfile).not.toContain('node:24-alpine3.22');
    expect(dockerfile).not.toContain('alpine');
    expect(dockerfile).toContain('RUN npm ci --ignore-scripts');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
    expect(dockerfile).toContain('RUN node ./node_modules/typescript/bin/tsc -p apps/api/tsconfig.json');
    expect(dockerfile).not.toContain('RUN npm run build');
    expect(dockerfile).toContain('FROM shared-builder AS api-runtime-files');
    expect(dockerfile).toContain('COPY --from=api-runtime-files /runtime/workspace ./workspace');
    expect(dockerfile).toContain('CMD ["/usr/local/bin/node", "apps/api/dist/apps/api/src/index.js"]');
  });

  it('builds the worker image from the committed dependency lockfile', () => {
    const compose = YAML.parse(fs.readFileSync(path.resolve(process.cwd(), 'docker-compose.yml'), 'utf8')) as {
      services?: {
        worker?: {
          build?: {
            dockerfile?: string;
            target?: string;
          };
        };
      };
    };
    const dockerignore = fs.readFileSync(path.resolve(process.cwd(), '.dockerignore'), 'utf8');
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.backend'), 'utf8');
    const lockfileInstallCount = (dockerfile.match(/RUN npm ci --ignore-scripts/g) ?? []).length;

    expect(compose.services?.worker?.build?.dockerfile).toBe('docker/Dockerfile.backend');
    expect(compose.services?.worker?.build?.target).toBe('worker');
    expect(dockerignore.split(/\r?\n/)).not.toContain('package-lock.json');
    expect(lockfileInstallCount).toBe(1);
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS node-runtime');
    expect(dockerfile).toContain('FROM node:22-trixie-slim AS shared-builder');
    expect(dockerfile).toContain('FROM node:22-trixie-slim AS shared-production-deps');
    expect(dockerfile).toContain('FROM gcr.io/distroless/cc-debian12 AS worker');
    expect(dockerfile).not.toContain('FROM gcr.io/distroless/nodejs22-debian12 AS worker');
    expect(dockerfile).not.toContain('FROM node:22-trixie-slim AS worker');
    expect(dockerfile).not.toContain('node:20.9.0');
    expect(dockerfile).not.toContain('node:24-alpine3.22');
    expect(dockerfile).not.toContain('alpine');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
    expect(dockerfile).toContain('COPY --from=shared-production-deps /app/node_modules ./node_modules');
    expect(dockerfile).not.toContain('COPY --from=shared-builder /app/package-lock.json ./package-lock.json');
    expect(dockerfile).not.toContain('RUN npm prune --omit=dev --ignore-scripts');
    expect(dockerfile).toContain('RUN node ./node_modules/typescript/bin/tsc -p apps/api/tsconfig.json');
    expect(dockerfile).not.toContain('RUN npm run build');
    expect(dockerfile).toContain('CMD ["/usr/local/bin/node", "apps/worker/dist/apps/worker/src/worker.server.js"]');
  });

  it('runs the API entrypoint directly in the distroless runtime', () => {
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.backend'), 'utf8');

    expect(dockerfile).not.toContain('COPY scripts/run-with-env.js ./scripts/run-with-env.js');
    expect(dockerfile).toContain('CMD ["/usr/local/bin/node", "apps/api/dist/apps/api/src/index.js"]');
  });

  it('serializes heavy backend Docker stages for multi-target compose builds', () => {
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.backend'), 'utf8');

    expect(dockerfile).toContain('touch /tmp/shared-builder-ready');
    expect(dockerfile).toContain('COPY --from=shared-builder /tmp/shared-builder-ready /tmp/shared-builder-ready');
    expect(dockerfile).toContain('touch /tmp/shared-production-deps-ready');
    expect(dockerfile).toContain(
      'COPY --from=shared-production-deps /tmp/shared-production-deps-ready /tmp/shared-production-deps-ready',
    );
    expect(dockerfile).not.toContain('sandbox-production-deps');
  });
});
