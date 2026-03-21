import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const serviceFile = path.join(rootDir, 'apps', 'api', 'src', 'services', 'leaderboard.service.ts');
const routeFile = path.join(rootDir, 'apps', 'api', 'src', 'routes', 'leaderboard.routes.ts');

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
    name: 'leaderboard-repository-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Repository\(/,
  },
  {
    name: 'leaderboard-service-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Service\(/,
  },
  { name: 'leaderboard-dynamic-import', regex: /await\s+import\(/ },
];

const routePatterns: Pattern[] = [
  {
    name: 'leaderboard-repository-direct-instantiation',
    regex: /\bnew\s+LeaderboardRepository\(/,
  },
  {
    name: 'leaderboard-service-direct-instantiation',
    regex: /\bnew\s+LeaderboardService\(/,
  },
];

/** Scans a file for stale leaderboard DI wiring that should be removed in Slice 21. */
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

/** Runs the Slice 21 leaderboard DI guard and exits non-zero when stale patterns remain. */
function main(): void {
  const violations = [
    ...scanFile(serviceFile, servicePatterns),
    ...scanFile(routeFile, routePatterns),
  ];

  console.log(
    JSON.stringify(
      {
        checkedFiles: 2,
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