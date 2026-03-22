import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const loggerFile = path.join(rootDir, 'packages', 'shared', 'utils', 'logger.ts');
const jwtFile = path.join(rootDir, 'packages', 'shared', 'utils', 'jwt.ts');
const consumerRoots = [path.join(rootDir, 'apps'), path.join(rootDir, 'packages')];

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

type FilePattern = {
  name: string;
  regex: RegExp;
};

const loggerPatterns: FilePattern[] = [
  {
    name: 'stale-top-level-winston-create-logger',
    regex: /export const logger\s*=\s*winston\.createLogger\(/,
  },
  {
    name: 'stale-top-level-daily-rotate-file-construction',
    regex: /new DailyRotateFile\(/,
  },
  {
    name: 'stale-top-level-log-dir-constant',
    regex: /const LOG_DIR\s*=\s*process\.env\.LOG_DIR/,
  },
];

const jwtPatterns: FilePattern[] = [
  {
    name: 'stale-top-level-jwt-secret-validation',
    regex: /if \(!process\.env\.JWT_ACCESS_SECRET\s*\|\|\s*!process\.env\.JWT_REFRESH_SECRET\)/,
  },
  {
    name: 'stale-top-level-access-secret-constant',
    regex: /const ACCESS_SECRET\s*=\s*process\.env\.JWT_ACCESS_SECRET/,
  },
  {
    name: 'stale-top-level-refresh-secret-constant',
    regex: /const REFRESH_SECRET\s*=\s*process\.env\.JWT_REFRESH_SECRET/,
  },
  {
    name: 'stale-top-level-access-expires-constant',
    regex: /const ACCESS_EXPIRES\s*=\s*process\.env\.JWT_ACCESS_EXPIRES_IN/,
  },
  {
    name: 'stale-top-level-refresh-expires-constant',
    regex: /const REFRESH_EXPIRES\s*=\s*process\.env\.JWT_REFRESH_EXPIRES_IN/,
  },
];

const consumerPatterns: FilePattern[] = [
  {
    name: 'direct-logger-construction',
    regex: /\bnew\s+Logger\(/,
  },
  {
    name: 'direct-jwt-utils-construction',
    regex: /\bnew\s+JWTUtils\(/,
  },
];

/** Normalizes paths for stable guard output across platforms. */
function relativePath(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

/** Converts a character index into a 1-based line number. */
function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

/** Scans one file for stale bootstrap patterns. */
function scanWholeFile(filePath: string, patterns: FilePattern[]): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];

  for (const pattern of patterns) {
    const match = pattern.regex.exec(content);
    if (!match || match.index === undefined) {
      continue;
    }

    violations.push({
      file: relativePath(filePath),
      line: lineNumberAt(content, match.index),
      pattern: pattern.name,
      snippet: match[0],
    });
  }

  return violations;
}

/** Recursively collects TypeScript files while excluding tests and archived scripts. */
function collectSourceFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const normalized = fullPath.replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (normalized.includes('/tests') || normalized.includes('/scripts/archive')) {
        continue;
      }

      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!entry.isFile() || !fullPath.endsWith('.ts')) {
      continue;
    }

    if (fullPath.endsWith('.test.ts') || fullPath.endsWith('.spec.ts')) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

/** Scans source files for new direct logger/JWT construction regressions. */
function scanConsumerFiles(): Violation[] {
  const files = consumerRoots.flatMap(collectSourceFiles);
  const violations: Violation[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      for (const pattern of consumerPatterns) {
        if (!pattern.regex.test(trimmed)) {
          continue;
        }

        violations.push({
          file: relativePath(filePath),
          line: index + 1,
          pattern: pattern.name,
          snippet: trimmed,
        });
      }
    });
  }

  return violations;
}

/** Runs the Slice 29 guard and exits non-zero when stale bootstrap patterns remain. */
function main(): void {
  const violations = [
    ...scanWholeFile(loggerFile, loggerPatterns),
    ...scanWholeFile(jwtFile, jwtPatterns),
    ...scanConsumerFiles(),
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