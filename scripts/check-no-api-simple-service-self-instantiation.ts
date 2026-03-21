import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const serviceFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'comment.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'learningprocess.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'learned-lesson.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'lessonDetail.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'admin', 'adminUser.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'admin', 'adminLesson.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'admin', 'adminTopic.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'admin', 'dashboard.service.ts'),
] as const;
const routeFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'comment.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'learningprocess.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'learned-lesson.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'lessonDetail.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'admin', 'adminUser.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'admin', 'adminTeacher.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'admin', 'adminLesson.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'admin', 'adminTopic.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'admin', 'dashboard.routes.ts'),
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
    name: 'simple-service-repository-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Repository\(/,
  },
  {
    name: 'simple-service-service-self-instantiation',
    regex: /this\.\w+\s*=\s*new\s+\w+Service\(/,
  },
  { name: 'simple-service-dynamic-import', regex: /await\s+import\(/ },
];

const routePatterns: Pattern[] = [
  { name: 'comment-service-direct-instantiation', regex: /\bnew\s+CommentService\(/ },
  { name: 'learningprocess-service-direct-instantiation', regex: /\bnew\s+LearningProcessService\(/ },
  { name: 'learned-lesson-service-direct-instantiation', regex: /\bnew\s+LearnedLessonService\(/ },
  { name: 'lesson-detail-service-direct-instantiation', regex: /\bnew\s+LessonDetailService\(/ },
  { name: 'admin-user-service-direct-instantiation', regex: /\bnew\s+AdminUserService\(/ },
  { name: 'admin-lesson-service-direct-instantiation', regex: /\bnew\s+AdminLessonService\(/ },
  { name: 'admin-topic-service-direct-instantiation', regex: /\bnew\s+AdminTopicService\(/ },
  { name: 'dashboard-service-direct-instantiation', regex: /\bnew\s+DashboardService\(/ },
];

/** Scans a file for stale simple-service DI patterns that should be removed in Slice 16. */
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

/** Runs the Slice 16 simple-service DI guard and exits non-zero when stale patterns remain. */
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
