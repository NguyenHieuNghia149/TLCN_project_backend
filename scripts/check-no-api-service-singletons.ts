import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const apiSourceDir = path.join(rootDir, 'apps', 'api', 'src');
const fileExtensions = new Set(['.ts', '.js']);

const targetedPatterns = [
  {
    file: path.join(apiSourceDir, 'services', 'exam-auto-submit.service.ts'),
    patterns: [
      {
        name: 'exam-auto-submit-singleton-export',
        regex: /^export const examAutoSubmitService\s*=\s*new ExamAutoSubmitService\(/,
      },
    ],
  },
  {
    file: path.join(apiSourceDir, 'services', 'submission.service.ts'),
    patterns: [
      {
        name: 'submission-service-singleton-export',
        regex: /^export const submissionService\s*=\s*new SubmissionService\(/,
      },
    ],
  },
  {
    file: path.join(apiSourceDir, 'services', 'notification.service.ts'),
    patterns: [
      {
        name: 'notification-service-singleton-export',
        regex: /^export const notificationService\s*=\s*new NotificationService\(/,
      },
    ],
  },
  {
    file: path.join(apiSourceDir, 'services', 'lesson.service.ts'),
    patterns: [
      {
        name: 'lesson-service-default-singleton-export',
        regex: /^export default new LessonService\(/,
      },
    ],
  },
  {
    file: path.join(apiSourceDir, 'services', 'exam.service.ts'),
    patterns: [
      {
        name: 'exam-service-dynamic-notification-import',
        regex: /await\s+import\(['"]\.\/notification\.service['"]\)/,
      },
    ],
  },
  {
    file: path.join(apiSourceDir, 'index.ts'),
    patterns: [
      {
        name: 'api-index-singleton-exam-auto-submit-require',
        regex: /const\s+\{\s*examAutoSubmitService\s*\}\s*=\s*require\(['"]\.\/services\/exam-auto-submit\.service['"]\)/,
      },
    ],
  },
] as const;

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

/** Returns true when a file should be skipped by the API singleton guard. */
function shouldSkip(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/tests/') ||
    normalized.includes('/scripts/archive/') ||
    normalized.includes('/dist/') ||
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.spec.ts')
  );
}

/** Recursively collects active API source files that should be scanned by the guard. */
function collectFiles(currentPath: string, files: string[]): void {
  if (!fs.existsSync(currentPath)) {
    return;
  }

  const stats = fs.statSync(currentPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      if (entry === 'dist' || entry === 'node_modules') {
        continue;
      }
      collectFiles(path.join(currentPath, entry), files);
    }
    return;
  }

  if (!fileExtensions.has(path.extname(currentPath)) || shouldSkip(currentPath)) {
    return;
  }

  files.push(currentPath);
}

/** Scans a single file for stale singleton and direct import patterns. */
function scanFile(filePath: string, patternName: string, regex: RegExp): Violation[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    if (!regex.test(line)) {
      return;
    }

    violations.push({
      file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
      line: index + 1,
      pattern: patternName,
      snippet: line.trim(),
    });
  });

  return violations;
}

/** Runs the API singleton guard and exits non-zero when stale patterns remain. */
function main(): void {
  const violations: Violation[] = [];

  for (const target of targetedPatterns) {
    for (const pattern of target.patterns) {
      violations.push(...scanFile(target.file, pattern.name, pattern.regex));
    }
  }

  const activeApiFiles: string[] = [];
  collectFiles(apiSourceDir, activeApiFiles);

  for (const filePath of activeApiFiles) {
    const normalized = filePath.replace(/\\/g, '/');

    if (!normalized.endsWith('/services/websocket.service.ts')) {
      violations.push(
        ...scanFile(
          filePath,
          'websocket-service-direct-import',
          /import\s+.*\bwebsocketService\b.*from\s+['"]/,
        ),
      );
    }

    violations.push(
      ...scanFile(
        filePath,
        'submission-service-singleton-import',
        /import\s+.*\bsubmissionService\b.*from\s+['"]/,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        checkedFiles: targetedPatterns.length + activeApiFiles.length,
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

