import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const targets = [
  {
    scope: 'worker',
    root: path.join(rootDir, 'apps', 'worker'),
    patterns: [{ name: 'api-cross-import', regex: /@backend\/api\//g }],
  },
  {
    scope: 'sandbox',
    root: path.join(rootDir, 'apps', 'sandbox'),
    patterns: [{ name: 'api-cross-import', regex: /@backend\/api\//g }],
  },
  {
    scope: 'api',
    root: path.join(rootDir, 'apps', 'api'),
    patterns: [{ name: 'sandbox-cross-import', regex: /@backend\/sandbox\//g }],
  },
] as const;
const fileExtensions = new Set(['.ts', '.js']);

type Violation = {
  scope: string;
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
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.spec.ts') ||
    normalized.includes('/migrations/')
  );
}

function collectFiles(currentPath: string, files: string[]): void {
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

function findViolations(
  filePath: string,
  scope: string,
  patterns: readonly { name: string; regex: RegExp }[]
): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        violations.push({
          scope,
          file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
          line: index + 1,
          pattern: pattern.name,
          snippet: line.trim(),
        });
      }
      pattern.regex.lastIndex = 0;
    }
  });

  return violations;
}

function main(): void {
  const files: string[] = [];
  for (const target of targets) {
    if (fs.existsSync(target.root)) {
      collectFiles(target.root, files);
    }
  }

  const violations = targets.flatMap(target => {
    const scopedFiles = files.filter(file => file.startsWith(target.root + path.sep));
    return scopedFiles.flatMap(file => findViolations(file, target.scope, target.patterns));
  });

  if (violations.length === 0) {
    console.log(JSON.stringify({ checkedFiles: files.length, violations: [] }, null, 2));
    return;
  }

  console.log(JSON.stringify({ checkedFiles: files.length, violations }, null, 2));
  process.exitCode = 1;
}

main();