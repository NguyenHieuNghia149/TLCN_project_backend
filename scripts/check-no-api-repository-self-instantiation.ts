import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const repositoryFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'repositories', 'learningprocess.repository.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'repositories', 'admin', 'adminUser.repository.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'repositories', 'exam.repository.ts'),
] as const;
const serviceFactoryFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'learningprocess.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'admin', 'adminUser.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'exam.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'submission.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'admin', 'dashboard.service.ts'),
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

const repositoryPatterns: Pattern[] = [
  {
    name: 'learningprocess-inline-submission-repository',
    regex: /this\.[A-Za-z0-9_]+\s*=\s*new\s+SubmissionRepository\(/,
  },
  {
    name: 'learningprocess-inline-learned-lesson-repository',
    regex: /this\.[A-Za-z0-9_]+\s*=\s*new\s+LearnedLessonRepository\(/,
  },
  {
    name: 'orchestration-inline-problem-repository',
    regex: /this\.[A-Za-z0-9_]+\s*=\s*new\s+ProblemRepository\(/,
  },
  {
    name: 'learningprocess-inline-lesson-repository',
    regex: /this\.[A-Za-z0-9_]+\s*=\s*new\s+LessonRepository\(/,
  },
  {
    name: 'learningprocess-inline-topic-repository',
    regex: /this\.[A-Za-z0-9_]+\s*=\s*new\s+TopicRepository\(/,
  },
  {
    name: 'admin-user-inline-user-repository',
    regex: /this\.[A-Za-z0-9_]+\s*=\s*new\s+UserRepository\(/,
  },
  {
    name: 'repository-dynamic-import',
    regex: /await\s+import\(/,
  },
];

const serviceFactoryPatterns: Pattern[] = [
  {
    name: 'direct-learningprocess-repository-construction',
    regex: /\bnew\s+LearningProcessRepository\(/,
  },
  {
    name: 'direct-admin-user-repository-construction',
    regex: /\bnew\s+AdminUserRepository\(/,
  },
  {
    name: 'direct-exam-repository-construction',
    regex: /\bnew\s+ExamRepository\(/,
  },
];

/** Scans a file for stale repository orchestration DI patterns that should be removed in Slice 23. */
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

/** Runs the Slice 23 repository orchestration DI guard and exits non-zero when stale patterns remain. */
function main(): void {
  const violations = [
    ...repositoryFiles.flatMap(filePath => scanFile(filePath, repositoryPatterns)),
    ...serviceFactoryFiles.flatMap(filePath => scanFile(filePath, serviceFactoryPatterns)),
  ];

  console.log(
    JSON.stringify(
      {
        checkedFiles: repositoryFiles.length + serviceFactoryFiles.length,
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