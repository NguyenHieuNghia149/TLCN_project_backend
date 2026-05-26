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

  it('builds the API image from the committed dependency lockfile', () => {
    const dockerignore = fs.readFileSync(path.resolve(process.cwd(), '.dockerignore'), 'utf8');
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), 'docker/Dockerfile.api'), 'utf8');

    expect(dockerignore.split(/\r?\n/)).not.toContain('package-lock.json');
    expect(dockerfile).toContain('RUN npm ci --ignore-scripts');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
  });
});
