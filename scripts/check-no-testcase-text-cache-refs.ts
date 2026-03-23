import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const sourceRoots = [
  path.join(rootDir, 'apps'),
  path.join(rootDir, 'packages'),
  path.join(rootDir, 'scripts'),
  path.join(rootDir, 'tests'),
];
const allowedDirectories = [
  path.join(rootDir, 'packages', 'shared', 'db', 'migrations'),
  path.join(rootDir, 'scripts', 'archive'),
];
const allowedExactFiles = new Set<string>([
  path.join(rootDir, 'scripts', 'migrate', 'audit-post-drop.ts'),
  path.join(rootDir, 'scripts', 'migrate', 'backfill-testcase-json.ts'),
  path.join(rootDir, 'apps', 'api', 'tests', 'integration', 'submission-finalization.test.ts'),
]);
const fileExtensions = new Set(['.ts', '.js']);
const persistenceFiles = new Set<string>([
  path.join(rootDir, 'apps', 'api', 'src', 'repositories', 'problem.repository.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'repositories', 'testcase.repository.ts'),
]);
const linePatterns = [
  { name: 'schema-column', regex: /\btestcases\.input\b|\btestcases\.output\b/g },
  { name: 'schema-text-column', regex: /text\('input'\)|text\('output'\)/g },
];
const contentPatterns = [
  {
    name: 'information-schema-probe',
    regex:
      /information_schema\.columns[\s\S]{0,400}(column_name\s+IN\s*\('input', 'output'\)|column_name\s*=\s*'input'|column_name\s*=\s*'output')/gi,
  },
  {
    name: 'legacy-sql-insert',
    regex: /INSERT\s+INTO\s+testcases\s*\([\s\S]*?\binput\b[\s\S]*?\boutput\b/gi,
  },
  {
    name: 'legacy-sql-update',
    regex: /UPDATE\s+testcases[\s\S]*?(\binput\s*=|\boutput\s*=)/gi,
  },
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
    ? [...linePatterns, ...contentPatterns, ...persistencePatterns]
    : [...linePatterns, ...contentPatterns];
}

function getLineNumber(content: string, matchIndex: number): number {
  return content.slice(0, matchIndex).split(/\r?\n/).length;
}

function getLineSnippet(content: string, lineNumber: number): string {
  const lines = content.split(/\r?\n/);
  return lines[lineNumber - 1]?.trim() ?? '';
}

function findViolations(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const patterns = getPatternsForFile(filePath);
  const violations: Violation[] = [];

  for (const pattern of patterns) {
    if ('lastIndex' in pattern.regex) {
      pattern.regex.lastIndex = 0;
    }
  }

  lines.forEach((line, index) => {
    for (const pattern of linePatterns.concat(persistenceFiles.has(filePath) ? persistencePatterns : [])) {
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

  for (const pattern of contentPatterns) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.regex.exec(content);
    while (match) {
      const lineNumber = getLineNumber(content, match.index);
      violations.push({
        file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        line: lineNumber,
        pattern: pattern.name,
        snippet: getLineSnippet(content, lineNumber),
      });
      match = pattern.regex.exec(content);
    }
  }

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