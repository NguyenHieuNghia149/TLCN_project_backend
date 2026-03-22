import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const runtimeFile = path.join(rootDir, 'packages', 'shared', 'runtime', 'judge-queue.ts');
const consumerFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'index.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'admin.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'cron', 'watchdog.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'submission.service.ts'),
  path.join(rootDir, 'apps', 'worker', 'src', 'services', 'worker.service.ts'),
] as const;

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
    name: 'direct-judge-queue-service-construction',
    regex: /\bnew\s+JudgeQueueService\(/,
  },
];

function relativePath(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

/** Extracts a method block by name so guards only inspect that method body. */
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

/** Scans judge-queue.ts for stale inline bootstrap patterns that should be removed in Slice 25. */
function scanRuntimeFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  const initializeBlock = getMethodBlock(content, 'private initializeIfNeeded(): void');

  if (initializeBlock) {
    if (/new\s+Redis\(/.test(initializeBlock.block)) {
      violations.push({
        file: relativePath(filePath),
        line: lineNumberAt(content, initializeBlock.start),
        pattern: 'judge-queue-inline-redis-bootstrap-in-initialize-if-needed',
        snippet: 'private initializeIfNeeded(): void { ... new Redis(...) ... }',
      });
    }

    if (/new\s+Queue\(/.test(initializeBlock.block)) {
      violations.push({
        file: relativePath(filePath),
        line: lineNumberAt(content, initializeBlock.start),
        pattern: 'judge-queue-inline-bullmq-bootstrap-in-initialize-if-needed',
        snippet: 'private initializeIfNeeded(): void { ... new Queue(...) ... }',
      });
    }
  }

  const singletonMatch = /judgeQueueServiceInstance\s*=\s*new\s+JudgeQueueService\(/.exec(content);
  if (singletonMatch && singletonMatch.index !== undefined) {
    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, singletonMatch.index),
      pattern: 'judge-queue-singleton-direct-construction',
      snippet: singletonMatch[0],
    });
  }

  return violations;
}

/** Scans consumer files for stale direct JudgeQueueService construction. */
function scanConsumerFile(filePath: string, patterns: LinePattern[]): Violation[] {
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

/** Runs the Slice 25 judge queue bootstrap guard and exits non-zero when stale patterns remain. */
function main(): void {
  const violations = [
    ...scanRuntimeFile(runtimeFile),
    ...consumerFiles.flatMap(filePath => scanConsumerFile(filePath, consumerPatterns)),
  ];

  console.log(
    JSON.stringify(
      {
        checkedFiles: 1 + consumerFiles.length,
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
