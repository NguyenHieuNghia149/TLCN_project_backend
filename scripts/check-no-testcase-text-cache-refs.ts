import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const sourceRoots = [
  path.join(rootDir, 'apps'),
  path.join(rootDir, 'packages'),
  path.join(rootDir, 'scripts'),
];
const allowedDirectories = [
  path.join(rootDir, 'packages', 'shared', 'db', 'migrations'),
  path.join(rootDir, 'scripts', 'archive'),
  path.join(rootDir, 'tests'),
];
const allowedExactFiles = new Set<string>([
  path.join(rootDir, 'scripts', 'migrate', 'audit-post-drop.ts'),
]);
const fileExtensions = new Set(['.ts', '.js']);
const persistenceFiles = new Set<string>([
  path.join(rootDir, 'apps', 'api', 'src', 'repositories', 'problem.repository.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'repositories', 'testcase.repository.ts'),
]);
const globalPatterns = [
  { name: 'schema-column', regex: /\btestcases\.input\b|\btestcases\.output\b/g },
  { name: 'schema-text-column', regex: /text\('input'\)|text\('output'\)/g },
];
const persistencePatterns = [
  { name: 'cached-display-write', regex: /buildFunctionInputDisplayValue\(|canonicalizeStructuredValue\(/g },
];

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

function isAllowedPath(filePath: string): boolean {
  if (allowedExactFiles.has(filePath)) {
    return true;
  }

  return allowedDirectories.some(directory => filePath.startsWith(directory + path.sep));
}

function collectFiles(currentPath: string, result: string[]): void {
  const stats = fs.statSync(currentPath);

  if (stats.isDirectory()) {
    if (isAllowedPath(currentPath)) {
      return;
    }

    for (const entry of fs.readdirSync(currentPath)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') {
        continue;
      }
      collectFiles(path.join(currentPath, entry), result);
    }
    return;
  }

  if (fileExtensions.has(path.extname(currentPath)) && !isAllowedPath(currentPath)) {
    result.push(currentPath);
  }
}

function getPatternsForFile(filePath: string) {
  return persistenceFiles.has(filePath)
    ? [...globalPatterns, ...persistencePatterns]
    : globalPatterns;
}

function findViolations(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const patterns = getPatternsForFile(filePath);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        violations.push({
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