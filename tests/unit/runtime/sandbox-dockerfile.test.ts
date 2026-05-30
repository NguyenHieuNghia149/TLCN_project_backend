import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'yaml';

describe('sandbox Dockerfile runtime dependencies', () => {
  it('installs nlohmann-json3-dev for the C++ JSON wrapper', () => {
    const dockerfilePath = path.resolve(process.cwd(), 'docker', 'Dockerfile.sandbox');
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(dockerfile).toContain('nlohmann-json3-dev');
  });

  it('installs Jackson libraries for the Java JSON wrapper', () => {
    const dockerfilePath = path.resolve(process.cwd(), 'docker', 'Dockerfile.sandbox');
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(dockerfile).toContain('libjackson2-annotations-java');
    expect(dockerfile).toContain('libjackson2-core-java');
    expect(dockerfile).toContain('libjackson2-databind-java');
  });

  it('installs Node dependencies from the lockfile without package lifecycle scripts', () => {
    const dockerfilePath = path.resolve(process.cwd(), 'docker', 'Dockerfile.sandbox');
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    const lockfileInstallCount = (dockerfile.match(/RUN npm ci --ignore-scripts/g) ?? []).length;

    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS builder');
    expect(lockfileInstallCount).toBe(1);
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS production-deps');
    expect(dockerfile).toContain('https://deb.nodesource.com/setup_22.x');
    expect(dockerfile).not.toContain('node:20.9.0');
    expect(dockerfile).not.toContain('node:24-bookworm-slim');
    expect(dockerfile).not.toContain('bullseye');
    expect(dockerfile).not.toContain('setup_20.x');
    expect(dockerfile).not.toContain('setup_24.x');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
    expect(dockerfile).toContain('COPY --from=production-deps /app/node_modules ./node_modules');
    expect(dockerfile).not.toContain('COPY --from=builder /app/package-lock.json ./package-lock.json');
    expect(dockerfile).not.toContain('RUN npm prune --omit=dev --ignore-scripts');
    expect(dockerfile).not.toContain('RUN npm install');
    expect(dockerfile).not.toContain('RUN npm install --omit=dev --ignore-scripts');
  });
});

describe('sandbox Java runtime configuration', () => {
  it('uses the Jackson classpath when compiling and running Java wrappers', () => {
    const configPath = path.resolve(process.cwd(), 'config', 'sandbox.yaml');
    const config = yaml.parse(fs.readFileSync(configPath, 'utf8')) as {
      judge: {
        languages: Array<{
          value: string;
          compile?: { command_template: string[] };
          test_case_run: { command_template: string[] };
        }>;
      };
    };
    const java = config.judge.languages.find(language => language.value === 'java');

    expect(java?.compile?.command_template).toEqual([
      'javac',
      '-cp',
      '.:/usr/share/java/*',
      '$SOURCE',
    ]);
    expect(java?.test_case_run.command_template).toContain('-cp');
    expect(java?.test_case_run.command_template).toContain('.:/usr/share/java/*');
  });
});
