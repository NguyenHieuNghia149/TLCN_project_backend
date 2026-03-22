import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const workerServiceFile = path.join(rootDir, 'apps', 'worker', 'src', 'services', 'worker.service.ts');
const grpcClientFile = path.join(rootDir, 'apps', 'worker', 'src', 'grpc', 'client.ts');
const workerServerFile = path.join(rootDir, 'apps', 'worker', 'src', 'worker.server.ts');

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

const workerServerPatterns: LinePattern[] = [
  {
    name: 'direct-worker-service-construction',
    regex: /\bnew\s+WorkerService\(/,
  },
  {
    name: 'direct-sandbox-grpc-client-construction',
    regex: /\bnew\s+SandboxGrpcClient\(/,
  },
];

/** Normalizes a file path so guard output stays stable across Windows path separators. */
function relativePath(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

/** Converts a string index into a 1-based line number for human-readable violations. */
function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

/** Extracts a method block by signature so the guard can target only stale inline bootstrap sites. */
function getMethodBlock(content: string, methodSignature: string): { start: number; block: string } | null {
  const signatureIndex = content.indexOf(methodSignature);
  if (signatureIndex === -1) {
    return null;
  }

  const bodyStart = content.indexOf('{', signatureIndex);
  if (bodyStart === -1) {
    return null;
  }

  let depth = 0;
  for (let index = bodyStart; index < content.length; index += 1) {
    const char = content[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          start: signatureIndex,
          block: content.slice(signatureIndex, index + 1),
        };
      }
    }
  }

  return null;
}

/** Scans WorkerService.start() for stale inline Redis and BullMQ worker bootstrap. */
function scanWorkerServiceFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  const startBlock = getMethodBlock(content, 'async start(): Promise<void>');

  if (!startBlock) {
    return violations;
  }

  if (/new\s+Redis\(/.test(startBlock.block)) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, startBlock.start),
      pattern: 'worker-start-inline-redis-bootstrap',
      snippet: 'async start(): Promise<void> { ... new Redis(...) ... }',
    });
  }

  if (/new\s+Worker\(/.test(startBlock.block)) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, startBlock.start),
      pattern: 'worker-start-inline-bullmq-bootstrap',
      snippet: 'async start(): Promise<void> { ... new Worker(...) ... }',
    });
  }

  return violations;
}

/** Scans SandboxGrpcClient for stale inline stub creation in the constructor. */
function scanGrpcClientFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  const constructorBlock = getMethodBlock(content, 'constructor(');

  if (constructorBlock) {
    const inlineStubMatch = /new\s+judgeProto\.judge\.SandboxService\(/.exec(constructorBlock.block);
    if (inlineStubMatch && inlineStubMatch.index !== undefined) {
      violations.push({
        file: relativePath(filePath),
        line: lineNumberAt(content, constructorBlock.start),
        pattern: 'grpc-client-inline-stub-bootstrap-in-constructor',
        snippet: 'constructor(...) { ... new judgeProto.judge.SandboxService(...) ... }',
      });
    }
  }

  const dynamicImportMatch = /await\s+import\(/.exec(content);
  if (dynamicImportMatch && dynamicImportMatch.index !== undefined) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, dynamicImportMatch.index),
      pattern: 'grpc-client-dynamic-import',
      snippet: dynamicImportMatch[0],
    });
  }

  return violations;
}

/** Scans line-oriented regression guards for direct consumer construction patterns. */
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

/** Runs the Slice 26 worker bootstrap guard and exits non-zero when stale patterns remain. */
function main(): void {
  const violations = [
    ...scanWorkerServiceFile(workerServiceFile),
    ...scanGrpcClientFile(grpcClientFile),
    ...scanLinePatterns(workerServerFile, workerServerPatterns),
  ];

  console.log(
    JSON.stringify(
      {
        checkedFiles: 3,
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
