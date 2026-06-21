import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const serviceFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'topic.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'lesson.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'notification.service.ts'),
] as const;
const routeFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'topic.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'lesson.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'notification.routes.ts'),
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
    name: 'content-notify-repository-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Repository\(/,
  },
  {
    name: 'content-notify-service-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Service\(/,
  },
  { name: 'content-notify-dynamic-import', regex: /await\s+import\(/ },
];

const routePatterns: Pattern[] = [
  { name: 'topic-service-direct-instantiation', regex: /\bnew\s+TopicService\(/ },
  { name: 'lesson-service-direct-instantiation', regex: /\bnew\s+LessonService\(/ },
  { name: 'notification-service-direct-instantiation', regex: /\bnew\s+NotificationService\(/ },
];

/** Scans a file for stale content and notification DI patterns that should be removed in Slice 19. */
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

/** Runs the Slice 19 content and notification DI guard and exits non-zero when stale patterns remain. */
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
