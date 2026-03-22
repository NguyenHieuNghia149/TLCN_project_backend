import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const sandboxServiceFile = path.join(rootDir, 'apps', 'sandbox', 'src', 'sandbox.service.ts');
const sandboxServerFile = path.join(rootDir, 'apps', 'sandbox', 'src', 'sandbox.server.ts');
const sandboxGrpcServerFile = path.join(rootDir, 'apps', 'sandbox', 'src', 'grpc', 'server.ts');
const sandboxRoutesFile = path.join(rootDir, 'apps', 'sandbox', 'src', 'sandbox.routes.ts');

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

type LinePattern = {
  name: string;
  regex: RegExp;
};

const consumerPatterns: LinePattern[] = [
  {
    name: 'direct-sandbox-service-construction',
    regex: /\bnew\s+SandboxService\(/,
  },
];

/** Normalizes a file path so guard output stays stable across Windows path separators. */
function relativePath(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

/** Converts a string index into a 1-based line number for readable guard output. */
function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

/** Extracts a scoped block between two file-level markers so checks stay focused on the intended region. */
function getScopedBlock(
  content: string,
  startMarker: string,
  endMarker: string,
): { start: number; block: string } | null {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = content.indexOf(endMarker, startIndex);
  return {
    start: startIndex,
    block: endIndex === -1 ? content.slice(startIndex) : content.slice(startIndex, endIndex),
  };
}

/** Scans sandbox.service.ts for stale inline constructor dependencies and no-arg construction. */
function scanSandboxServiceFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  const classBlock = getScopedBlock(content, 'export class SandboxService', '/** Creates a SandboxService');

  if (classBlock && /constructor\(\s*\)/.test(classBlock.block)) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, classBlock.start),
      pattern: 'sandbox-service-zero-arg-constructor',
      snippet: 'export class SandboxService { ... constructor() ... }',
    });
  }

  const constructorBlock = getScopedBlock(content, 'constructor(', 'private loadSandboxYamlConfig');
  if (constructorBlock) {
    const constructorPatterns: Array<{ name: string; regex: RegExp; snippet: string }> = [
      {
        name: 'sandbox-constructor-inline-env-read',
        regex: /process\.env\.SANDBOX_/,
        snippet: 'constructor(...) { ... process.env.SANDBOX_* ... }',
      },
      {
        name: 'sandbox-constructor-inline-workspace-env-read',
        regex: /process\.env\.WORKSPACE_DIR/,
        snippet: 'constructor(...) { ... process.env.WORKSPACE_DIR ... }',
      },
      {
        name: 'sandbox-constructor-runtime-security-getter',
        regex: /getSecurityService\(/,
        snippet: 'constructor(...) { ... getSecurityService(...) ... }',
      },
      {
        name: 'sandbox-constructor-runtime-monitoring-getter',
        regex: /getMonitoringService\(/,
        snippet: 'constructor(...) { ... getMonitoringService(...) ... }',
      },
    ];

    for (const pattern of constructorPatterns) {
      if (!pattern.regex.test(constructorBlock.block)) {
        continue;
      }

      violations.push({
        file: relativePath(filePath),
        line: lineNumberAt(content, constructorBlock.start),
        pattern: pattern.name,
        snippet: pattern.snippet,
      });
    }
  }

  const factoryBlock = getScopedBlock(content, 'export function createSandboxService()', '__no_following_export_marker__');
  if (factoryBlock && /new\s+SandboxService\(\s*\)/.test(factoryBlock.block)) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, factoryBlock.start),
      pattern: 'sandbox-service-factory-no-arg-construction',
      snippet: 'export function createSandboxService() { return new SandboxService(); }',
    });
  }

  const runtimeGetterPatterns: Array<{ name: string; regex: RegExp }> = [
    {
      name: 'sandbox-service-runtime-security-getter',
      regex: /getSecurityService\(/,
    },
    {
      name: 'sandbox-service-runtime-monitoring-getter',
      regex: /getMonitoringService\(/,
    },
  ];

  const validateBlock = getScopedBlock(content, 'private validateCodeSecurity', 'private getLastNonEmptyLine');
  if (validateBlock) {
    for (const pattern of runtimeGetterPatterns) {
      if (!pattern.regex.test(validateBlock.block)) {
        continue;
      }

      violations.push({
        file: relativePath(filePath),
        line: lineNumberAt(content, validateBlock.start),
        pattern: pattern.name,
        snippet: `private validateCodeSecurity(...) { ... ${pattern.regex.source} ... }`,
      });
    }
  }

  return violations;
}

/** Scans consumer files for direct SandboxService construction regressions. */
function scanLinePatterns(filePath: string, patterns: LinePattern[]): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    for (const pattern of patterns) {
      if (!pattern.regex.test(trimmed)) {
        continue;
      }

      violations.push({
        file: relativePath(filePath),
        line: index + 1,
        pattern: pattern.name,
        snippet: trimmed,
      });
    }
  });

  return violations;
}

/** Runs the Slice 28 sandbox service guard and exits non-zero when stale inline dependency patterns remain. */
function main(): void {
  const violations = [
    ...scanSandboxServiceFile(sandboxServiceFile),
    ...scanLinePatterns(sandboxServerFile, consumerPatterns),
    ...scanLinePatterns(sandboxGrpcServerFile, consumerPatterns),
    ...scanLinePatterns(sandboxRoutesFile, consumerPatterns),
  ];

  console.log(
    JSON.stringify(
      {
        checkedFiles: 4,
        violations,
      },
      null,
      2,
    ),
  );

  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main();

