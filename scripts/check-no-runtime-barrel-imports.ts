import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const targets = [
  path.join(rootDir, 'apps'),
  path.join(rootDir, 'tests'),
  path.join(rootDir, 'packages'),
] as const;
const fileExtensions = new Set(['.ts', '.js']);
const allowedGetQueueCallers = new Set([
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'admin.ts').replace(/\\/g, '/'),
  path.join(rootDir, 'packages', 'shared', 'runtime', 'judge-queue.ts').replace(/\\/g, '/'),
]);
const allowedBareRuntimeImportFiles = new Set([
  path.join(rootDir, 'packages', 'shared', 'runtime', 'index.ts').replace(/\\/g, '/'),
]);

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

function shouldSkip(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/scripts/archive/') ||
    normalized.includes('/migrations/') ||
    normalized.includes('/node_modules/') ||
    normalized.includes('/dist/')
  );
}

function collectFiles(currentPath: string, files: string[]): void {
  if (!fs.existsSync(currentPath)) {
    return;
  }

  const stats = fs.statSync(currentPath);

  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') {
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

function findViolations(filePath: string): Violation[] {
  const normalized = filePath.replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    if (
      /@backend\/shared\/runtime(?=['"])/.test(line) &&
      !allowedBareRuntimeImportFiles.has(normalized)
    ) {
      violations.push({
        file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        line: index + 1,
        pattern: 'bare-runtime-import',
        snippet: line.trim(),
      });
    }

    if (/\.getQueue\s*\(/.test(line) && !allowedGetQueueCallers.has(normalized)) {
      violations.push({
        file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        line: index + 1,
        pattern: 'getQueue-outside-admin',
        snippet: line.trim(),
      });
    }
  });

  return violations;
}

function main(): void {
  const files: string[] = [];
  for (const target of targets) {
    collectFiles(target, files);
  }

  const violations = files.flatMap(findViolations);

  if (violations.length === 0) {
    console.log(JSON.stringify({ checkedFiles: files.length, violations: [] }, null, 2));
    return;
  }

  console.log(JSON.stringify({ checkedFiles: files.length, violations }, null, 2));
  process.exitCode = 1;
}

main();
