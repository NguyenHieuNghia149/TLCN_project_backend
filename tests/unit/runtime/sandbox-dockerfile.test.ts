import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'yaml';

const readBackendDockerfile = (): string =>
  fs.readFileSync(path.resolve(process.cwd(), 'docker', 'Dockerfile.backend'), 'utf8');

const readSandboxStage = (): string => {
  const dockerfile = readBackendDockerfile();
  const sandboxStageMatch = /^FROM ubuntu:24\.04 AS sandbox$/m.exec(dockerfile);

  if (!sandboxStageMatch || sandboxStageMatch.index === undefined) {
    throw new Error('Sandbox stage not found in docker/Dockerfile.backend');
  }

  return dockerfile.slice(sandboxStageMatch.index);
};

describe('sandbox Dockerfile runtime dependencies', () => {
  it('installs nlohmann-json3-dev for the C++ JSON wrapper', () => {
    const dockerfile = readBackendDockerfile();

    expect(dockerfile).toContain('nlohmann-json3-dev');
  });

  it('uses pinned Jackson jars instead of vulnerable Ubuntu Jackson packages', () => {
    const dockerfile = readBackendDockerfile();
    const sandboxStage = readSandboxStage();

    expect(dockerfile).toContain('ARG JACKSON_VERSION=2.17.3');
    expect(dockerfile).toContain('jackson-annotations-${JACKSON_VERSION}.jar');
    expect(dockerfile).toContain('jackson-core-${JACKSON_VERSION}.jar');
    expect(dockerfile).toContain('jackson-databind-${JACKSON_VERSION}.jar');
    expect(sandboxStage).not.toContain('libjackson2-annotations-java');
    expect(sandboxStage).not.toContain('libjackson2-core-java');
    expect(sandboxStage).not.toContain('libjackson2-databind-java');
  });

  it('keeps apt runtime dependency installation headless and minimal', () => {
    const dockerfile = readSandboxStage();

    expect(dockerfile).toContain('apt-get install -y --no-install-recommends');
    expect(dockerfile).toMatch(/^\s+python3 \\$/m);
    expect(dockerfile).toContain('openjdk-17-jdk-headless');
    expect(dockerfile).toContain('libprotobuf32t64');
    expect(dockerfile).toContain('libnl-route-3-200');
    expect(dockerfile).not.toContain('openjdk-17-jdk \\');
    expect(dockerfile).not.toContain('build-essential');
    expect(dockerfile).not.toContain('git');
    expect(dockerfile).not.toContain('libprotobuf-dev');
    expect(dockerfile).not.toContain('protobuf-compiler');
    expect(dockerfile).not.toContain('libnl-route-3-dev');
    expect(dockerfile).not.toContain('libtool');
    expect(dockerfile).not.toContain('pkg-config');
    expect(dockerfile).not.toContain('flex');
    expect(dockerfile).not.toContain('bison');
  });

  it('builds nsjail outside the final sandbox image', () => {
    const dockerfile = readBackendDockerfile();
    const sandboxStage = readSandboxStage();

    expect(dockerfile).toContain('FROM ubuntu:24.04 AS sandbox-nsjail-builder');
    expect(dockerfile).toContain('COPY --from=sandbox-nsjail-builder /tmp/nsjail/nsjail /usr/bin/nsjail');
    expect(sandboxStage).not.toContain('git clone https://github.com/google/nsjail.git');
    expect(sandboxStage).not.toContain('make &&');
  });

  it('installs Node dependencies from the lockfile without package lifecycle scripts', () => {
    const dockerfile = readBackendDockerfile();
    const sandboxStage = readSandboxStage();
    const lockfileInstallCount = (dockerfile.match(/RUN npm ci --ignore-scripts/g) ?? []).length;

    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS node-runtime');
    expect(dockerfile).toContain('FROM node:22-trixie-slim AS shared-builder');
    expect(lockfileInstallCount).toBe(1);
    expect(dockerfile).not.toContain('sandbox-production-deps');
    expect(dockerfile).not.toContain('https://deb.nodesource.com/setup_22.x');
    expect(dockerfile).not.toContain('node:20.9.0');
    expect(dockerfile).not.toContain('alpine');
    expect(dockerfile).not.toContain('node:24-bookworm-slim');
    expect(dockerfile).not.toContain('bullseye');
    expect(dockerfile).not.toContain('setup_20.x');
    expect(dockerfile).not.toContain('setup_24.x');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts');
    expect(sandboxStage).toContain('COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node');
    expect(sandboxStage).toContain('COPY --from=shared-production-deps /app/node_modules ./node_modules');
    expect(sandboxStage).not.toContain('RUN npm ci --omit=dev --ignore-scripts');
    expect(sandboxStage).not.toContain('npm cache clean --force');
    expect(sandboxStage).not.toContain('apt-get install -y --no-install-recommends nodejs');
    expect(dockerfile).toContain('CMD ["/usr/local/bin/node", "apps/sandbox/dist/apps/sandbox/src/sandbox.server.js"]');
    expect(dockerfile).toContain(
      'COPY --from=shared-production-deps /tmp/shared-production-deps-ready /tmp/shared-production-deps-ready',
    );
    expect(dockerfile).not.toContain('COPY --from=shared-builder /app/package-lock.json ./package-lock.json');
    expect(dockerfile).not.toContain('RUN npm prune --omit=dev --ignore-scripts');
    expect(dockerfile).not.toContain('RUN npm install');
    expect(dockerfile).not.toContain('RUN npm install --omit=dev --ignore-scripts');
    expect(dockerfile).toContain('RUN node ./node_modules/typescript/bin/tsc -p apps/api/tsconfig.json');
    expect(dockerfile).not.toContain('RUN npm run build');
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
