import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const controllersDir = path.join(rootDir, 'apps', 'api', 'src', 'controllers');
const fileExtensions = new Set(['.ts', '.js']);

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

const disallowedPatterns = [
  {
    name: 'controller-service-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Service\(/,
  },
  {
    name: 'controller-repository-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Repository\(/,
  },
] as const;

/** Returns true when a controller file should be excluded from the guard scan. */
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

/** Recursively collects API controller source files that should be checked by the guard. */
function collectControllerFiles(currentPath: string, files: string[]): void {
  if (!fs.existsSync(currentPath)) {
    return;
  }

  const stats = fs.statSync(currentPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      if (entry === 'dist' || entry === 'node_modules') {
        continue;
      }
      collectControllerFiles(path.join(currentPath, entry), files);
    }
    return;
  }

  if (!fileExtensions.has(path.extname(currentPath)) || shouldSkip(currentPath)) {
    return;
  }

  files.push(currentPath);
}

/** Scans a controller file for self-instantiation patterns that should live in route factories. */
function scanFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    for (const pattern of disallowedPatterns) {
      if (!pattern.regex.test(trimmed)) {
        continue;
      }

      violations.push({
        file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        line: index + 1,
        pattern: pattern.name,
        snippet: trimmed,
      });
    }
  });

  return violations;
}

/** Runs the controller-instantiation guard and exits non-zero when stale patterns remain. */
function main(): void {
  const controllerFiles: string[] = [];
  collectControllerFiles(controllersDir, controllerFiles);

  const violations = controllerFiles.flatMap(scanFile);

  console.log(JSON.stringify({ checkedFiles: controllerFiles.length, violations }, null, 2));

  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main();
