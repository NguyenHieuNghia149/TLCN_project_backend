import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const routesDir = path.join(rootDir, 'apps', 'api', 'src', 'routes');
const submissionControllerFile = path.join(
  rootDir,
  'apps',
  'api',
  'src',
  'controllers',
  'submission.controller.ts'
);
const sseServiceFile = path.join(rootDir, 'apps', 'api', 'src', 'services', 'sse.service.ts');
const fileExtensions = new Set(['.ts', '.js']);

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

type Pattern = {
  name: string;
  regex: RegExp;
};

const topLevelRoutePatterns: Pattern[] = [
  { name: 'top-level-router', regex: /^const\s+router\s*=\s*Router\(/ },
  { name: 'top-level-controller-instantiation', regex: /^const\s+.*Controller\s*=\s*new\s+/ },
  { name: 'top-level-service-instantiation', regex: /^const\s+.*Service\s*=\s*new\s+/ },
  { name: 'top-level-rate-limit', regex: /^const\s+.*=\s*rateLimitMiddleware\(/ },
];

/** Counts brace depth changes so the guard can distinguish top-level code from factory bodies. */
function countBraces(line: string): number {
  return (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
}

/** Returns true when the file is a route module that should be factory-based. */
function isCheckedRouteFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.endsWith('.routes.ts');
}

/** Recursively collects route modules that should be checked for top-level side effects. */
function collectRouteFiles(currentPath: string, files: string[]): void {
  if (!fs.existsSync(currentPath)) {
    return;
  }

  const stats = fs.statSync(currentPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      collectRouteFiles(path.join(currentPath, entry), files);
    }
    return;
  }

  if (!fileExtensions.has(path.extname(currentPath)) || !isCheckedRouteFile(currentPath)) {
    return;
  }

  files.push(currentPath);
}

/** Scans a route file for top-level router, service, controller, and limiter setup. */
function findTopLevelRouteViolations(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];
  let braceDepth = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const isTopLevel = braceDepth === 0;

    if (isTopLevel) {
      for (const pattern of topLevelRoutePatterns) {
        if (pattern.regex.test(trimmed)) {
          violations.push({
            file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
            line: index + 1,
            pattern: pattern.name,
            snippet: trimmed,
          });
        }
      }
    }

    braceDepth += countBraces(line);
  });

  return violations;
}

/** Scans a single file for exact line-based stale import or singleton patterns. */
function findLineViolations(filePath: string, patterns: Pattern[]): Violation[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    for (const pattern of patterns) {
      if (pattern.regex.test(trimmed)) {
        violations.push({
          file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
          line: index + 1,
          pattern: pattern.name,
          snippet: trimmed,
        });
      }
    }
  });

  return violations;
}

/** Runs the route-side-effect guard and exits non-zero when stale patterns remain. */
function main(): void {
  const routeFiles: string[] = [];
  collectRouteFiles(routesDir, routeFiles);

  const violations = [
    ...routeFiles.flatMap(findTopLevelRouteViolations),
    ...findLineViolations(submissionControllerFile, [
      { name: 'submission-controller-eager-sse-import', regex: /^import\s+\{\s*sseService\s*\}\s+from\s+/ },
    ]),
    ...findLineViolations(sseServiceFile, [
      { name: 'eager-sse-singleton-export', regex: /^export\s+const\s+sseService\s*=\s*new\s+SseService\(/ },
    ]),
  ];

  console.log(JSON.stringify({ checkedFiles: routeFiles.length + 2, violations }, null, 2));
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main();
