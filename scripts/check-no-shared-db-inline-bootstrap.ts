import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const connectionFile = path.join(rootDir, 'packages', 'shared', 'db', 'connection.ts');
const apiIndexFile = path.join(rootDir, 'apps', 'api', 'src', 'index.ts');

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

const connectionPatterns: FilePattern[] = [
  {
    name: 'stale-top-level-pool-construction',
    regex: /^const pool\s*=\s*new Pool\(/m,
  },
  {
    name: 'stale-top-level-drizzle-client-export',
    regex: /^export const db\s*=\s*drizzle\(/m,
  },
  {
    name: 'stale-top-level-sigint-handler',
    regex: /process\.on\('SIGINT'/,
  },
  {
    name: 'stale-top-level-sigterm-handler',
    regex: /process\.on\('SIGTERM'/,
  },
  {
    name: 'stale-top-level-load-env-import',
    regex: /import '\.\.\/utils\/load-env';/,
  },
  {
    name: 'stale-shared-utils-barrel-import',
    regex: /from '@backend\/shared\/utils'/,
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

/** Scans one file for forbidden whole-file patterns. */
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

/** Ensures API startup explicitly registers DB process handlers. */
function scanApiIndex(): Violation[] {
  const content = fs.readFileSync(apiIndexFile, 'utf8');
  const violations: Violation[] = [];

  if (!/registerDatabaseProcessHandlers\(/.test(content)) {
    violations.push({
      file: relativePath(apiIndexFile),
      line: 1,
      pattern: 'missing-database-process-handler-registration',
      snippet: 'registerDatabaseProcessHandlers(...)',
    });
  }

  const directDbHandlerMatch =
    /process\.(?:on|once)\(\s*['"]SIG(?:INT|TERM)['"][\s\S]{0,250}(?:DatabaseService|disconnect)/.exec(
      content,
    );

  if (directDbHandlerMatch && directDbHandlerMatch.index !== undefined) {
    violations.push({
      file: relativePath(apiIndexFile),
      line: lineNumberAt(content, directDbHandlerMatch.index),
      pattern: 'direct-database-signal-handler-in-api-index',
      snippet: directDbHandlerMatch[0].split(/\r?\n/)[0] ?? 'process signal handler',
    });
  }

  return violations;
}

/** Runs the Slice 32 guard and exits non-zero when stale DB bootstrap patterns remain. */
function main(): void {
  const violations = [
    ...scanWholeFile(connectionFile, connectionPatterns),
    ...scanApiIndex(),
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




