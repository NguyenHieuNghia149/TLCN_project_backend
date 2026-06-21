import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const sourceRoots = [path.join(rootDir, 'apps'), path.join(rootDir, 'packages')];
const fileExtensions = new Set(['.ts', '.js']);
const disallowedPatterns = [
  'scripts/archive/migrate/backfill-function-signature',
  'scripts/archive/migrate/audit-function-signature',
  'scripts/archive/migrate/ast-normalizer',
];

type Violation = {
  file: string;
  pattern: string;
};

function collectFiles(currentPath: string, result: string[]): void {
  const stats = fs.statSync(currentPath);

  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') {
        continue;
      }

      collectFiles(path.join(currentPath, entry), result);
    }
    return;
  }

  if (fileExtensions.has(path.extname(currentPath))) {
    result.push(currentPath);
  }
}

function findViolations(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return disallowedPatterns
    .filter(pattern => content.includes(pattern))
    .map(pattern => ({
      file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
      pattern,
    }));
}

function main(): void {
  const files: string[] = [];
  sourceRoots.forEach(sourceRoot => {
    if (fs.existsSync(sourceRoot)) {
      collectFiles(sourceRoot, files);
    }
  });

  const violations = files.flatMap(findViolations);

  if (violations.length === 0) {
    console.log(JSON.stringify({ checkedFiles: files.length, violations: [] }, null, 2));
    return;
  }

  console.log(JSON.stringify({ checkedFiles: files.length, violations }, null, 2));
  process.exitCode = 1;
}

main();
