import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const serviceFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'challenge.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'favorite.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'submission.service.ts'),
] as const;
const routeFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'challenge.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'favorite.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'submission.routes.ts'),
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
    name: 'judge-service-repository-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Repository\(/,
  },
  {
    name: 'judge-service-service-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Service\(/,
  },
  { name: 'judge-service-dynamic-import', regex: /await\s+import\(/ },
];

const routePatterns: Pattern[] = [
  { name: 'challenge-service-direct-instantiation', regex: /\bnew\s+ChallengeService\(/ },
  { name: 'favorite-service-direct-instantiation', regex: /\bnew\s+FavoriteService\(/ },
  { name: 'submission-service-direct-instantiation', regex: /\bnew\s+SubmissionService\(/ },
];

/** Scans a file for stale judge-service DI patterns that should be removed in Slice 17. */
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

/** Runs the Slice 17 judge-service DI guard and exits non-zero when stale patterns remain. */
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
