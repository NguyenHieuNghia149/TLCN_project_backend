import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const serviceFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'exam.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'exam-auto-submit.service.ts'),
] as const;
const routeFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'exam.routes.ts'),
] as const;

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

const servicePatterns: Pattern[] = [
  {
    name: 'exam-orchestration-repository-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Repository\(/,
  },
  {
    name: 'exam-orchestration-service-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Service\(/,
  },
  {
    name: 'exam-orchestration-factory-self-instantiation',
    regex: /this\.\w+\s*=\s*create\w+Service\(/,
  },
  { name: 'exam-orchestration-dynamic-import', regex: /await\s+import\(/ },
];

const routePatterns: Pattern[] = [
  { name: 'exam-service-direct-instantiation', regex: /\bnew\s+ExamService\(/ },
];

/** Scans a file for stale exam orchestration DI patterns that should be removed in Slice 18. */
function scanFile(filePath: string, patterns: Pattern[]): Violation[] {
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
        file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        line: index + 1,
        pattern: pattern.name,
        snippet: trimmed,
      });
    }
  });

  return violations;
}

/** Runs the Slice 18 exam orchestration guard and exits non-zero when stale patterns remain. */
function main(): void {
  const violations = [
    ...serviceFiles.flatMap(filePath => scanFile(filePath, servicePatterns)),
    ...routeFiles.flatMap(filePath => scanFile(filePath, routePatterns)),
  ];

  console.log(
    JSON.stringify(
      {
        checkedFiles: serviceFiles.length + routeFiles.length,
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
