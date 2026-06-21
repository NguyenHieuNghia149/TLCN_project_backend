import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const workerSourceDir = path.join(rootDir, 'apps', 'worker', 'src');
const fileExtensions = new Set(['.ts', '.js']);

const targetedPatterns = [
  {
    file: path.join(workerSourceDir, 'services', 'worker.service.ts'),
    patterns: [
      {
        name: 'worker-service-singleton-export',
        regex: /^export const workerService\s*=\s*new WorkerService\(/,
      },
    ],
  },
  {
    file: path.join(workerSourceDir, 'grpc', 'client.ts'),
    patterns: [
      {
        name: 'sandbox-grpc-client-singleton-export',
        regex: /^export const sandboxGrpcClient\s*=\s*new SandboxGrpcClient\(/,
      },
    ],
  },
  {
    file: path.join(workerSourceDir, 'worker.server.ts'),
    patterns: [
      {
        name: 'worker-service-singleton-import',
        regex: /import\s+.*\bworkerService\b.*from\s+['"]\.\/services\/worker\.service['"]/
      },
    ],
  },
] as const;

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

function shouldSkip(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/tests/') ||
    normalized.includes('/scripts/archive/') ||
    normalized.includes('/dist/') ||
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.spec.ts')
  );
}

function collectFiles(currentPath: string, files: string[]): void {
  if (!fs.existsSync(currentPath)) {
    return;
  }

  const stats = fs.statSync(currentPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      if (entry === 'dist' || entry === 'node_modules') {
        continue;
      }
      collectFiles(path.join(currentPath, entry), files);
    }
    return;
  }

  if (!fileExtensions.has(path.extname(currentPath)) || shouldSkip(currentPath)) {
    return;
  }

  files.push(currentPath);
}

function main(): void {
  const violations: Violation[] = [];

  for (const target of targetedPatterns) {
    if (!fs.existsSync(target.file)) {
      continue;
    }

    const content = fs.readFileSync(target.file, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const pattern of target.patterns) {
        if (!pattern.regex.test(line)) {
          continue;
        }

        violations.push({
          file: path.relative(rootDir, target.file).replace(/\\/g, '/'),
          line: index + 1,
          pattern: pattern.name,
          snippet: line.trim(),
        });
      }
    });
  }

  const activeWorkerFiles: string[] = [];
  collectFiles(workerSourceDir, activeWorkerFiles);

  for (const filePath of activeWorkerFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (!/import\s+.*\bsandboxGrpcClient\b.*from\s+['"]/.test(line)) {
        return;
      }

      violations.push({
        file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        line: index + 1,
        pattern: 'sandbox-grpc-client-import',
        snippet: line.trim(),
      });
    });
  }

  console.log(
    JSON.stringify(
      {
        checkedFiles: targetedPatterns.length + activeWorkerFiles.length,
        violations,
      },
      null,
      2
    )
  );

  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main();
