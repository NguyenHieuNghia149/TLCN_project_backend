import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const codeSecurityFile = path.join(rootDir, 'packages', 'shared', 'runtime', 'code-security.ts');
const codeMonitoringFile = path.join(rootDir, 'packages', 'shared', 'runtime', 'code-monitoring.ts');
const sandboxServiceFile = path.join(rootDir, 'apps', 'sandbox', 'src', 'sandbox.service.ts');
const securityControllerFile = path.join(rootDir, 'apps', 'api', 'src', 'controllers', 'security.controller.ts');

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
    name: 'direct-code-security-service-construction',
    regex: /\bnew\s+CodeSecurityService\(/,
  },
  {
    name: 'direct-code-monitoring-service-construction',
    regex: /\bnew\s+CodeMonitoringService\(/,
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

/** Extracts a scoped block between two file-level markers so checks stay local to the intended class. */
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

/** Scans code-security.ts for stale singleton construction and zero-argument constructor usage. */
function scanCodeSecurityFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  const singletonMatch = /securityServiceInstance\s*=\s*new\s+CodeSecurityService\(/.exec(content);

  if (singletonMatch && singletonMatch.index !== undefined) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, singletonMatch.index),
      pattern: 'stale-code-security-singleton-construction',
      snippet: singletonMatch[0],
    });
  }

  const classBlock = getScopedBlock(content, 'export class CodeSecurityService', 'let securityServiceInstance');
  if (classBlock && /constructor\(\s*\)/.test(classBlock.block)) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, classBlock.start),
      pattern: 'code-security-zero-arg-constructor',
      snippet: 'export class CodeSecurityService { ... constructor() ... }',
    });
  }

  return violations;
}

/** Scans code-monitoring.ts for stale singleton construction and zero-argument constructor usage. */
function scanCodeMonitoringFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  const singletonMatch = /monitoringServiceInstance\s*=\s*new\s+CodeMonitoringService\(/.exec(content);

  if (singletonMatch && singletonMatch.index !== undefined) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, singletonMatch.index),
      pattern: 'stale-code-monitoring-singleton-construction',
      snippet: singletonMatch[0],
    });
  }

  const classBlock = getScopedBlock(content, 'export class CodeMonitoringService', 'let monitoringServiceInstance');
  if (classBlock && /constructor\(\s*\)/.test(classBlock.block)) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, classBlock.start),
      pattern: 'code-monitoring-zero-arg-constructor',
      snippet: 'export class CodeMonitoringService { ... constructor() ... }',
    });
  }

  return violations;
}

/** Scans consumer files for direct runtime service construction regressions. */
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

/** Runs the Slice 27 runtime code-service guard and exits non-zero when stale singleton patterns remain. */
function main(): void {
  const violations = [
    ...scanCodeSecurityFile(codeSecurityFile),
    ...scanCodeMonitoringFile(codeMonitoringFile),
    ...scanLinePatterns(sandboxServiceFile, consumerPatterns),
    ...scanLinePatterns(securityControllerFile, consumerPatterns),
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
