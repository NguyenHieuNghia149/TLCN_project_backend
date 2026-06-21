import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const targetFile = path.join(rootDir, 'apps', 'api', 'src', 'index.ts');

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

type Pattern = {
  name: string;
  regex: RegExp;
  allowInRequireMainGuard?: boolean;
};

const patterns: Pattern[] = [
  { name: 'top-level-dotenv-config', regex: /^config\(/ },
  { name: 'top-level-express-app', regex: /^const\s+app\s*=\s*express\(/ },
  { name: 'top-level-http-server', regex: /^const\s+server\s*=\s*createServer\(/ },
  { name: 'top-level-start-server', regex: /^startServer\(/ },
  { name: 'top-level-start-api-server', regex: /^void\s+startApiServer\(/, allowInRequireMainGuard: true },
  { name: 'top-level-admin-routes-import', regex: /^import\s+.*from\s+['"]\.\/routes\/admin['"]/ },
  { name: 'top-level-watchdog-import', regex: /^import\s+.*from\s+['"]\.\/cron\/watchdog['"]/ },
  {
    name: 'top-level-exam-auto-submit-import',
    regex: /^import\s+.*from\s+['"]\.\/services\/exam-auto-submit\.service['"]/, 
  },
  {
    name: 'top-level-websocket-import',
    regex: /^import\s+.*from\s+['"]\.\/services\/websocket\.service['"]/, 
  },
];

/** Counts brace depth changes so the guard can distinguish top-level code from guarded blocks. */
function countBraces(line: string): number {
  return (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
}

/** Scans the API bootstrap file for top-level startup side effects that should stay inside factories. */
function main(): void {
  const violations: Violation[] = [];

  if (!fs.existsSync(targetFile)) {
    console.log(JSON.stringify({ checkedFiles: 0, violations }, null, 2));
    return;
  }

  const content = fs.readFileSync(targetFile, 'utf8');
  const lines = content.split(/\r?\n/);
  let braceDepth = 0;
  let requireMainGuardDepth: number | null = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const isTopLevel = braceDepth === 0;
    const insideRequireMainGuard =
      requireMainGuardDepth !== null && braceDepth >= requireMainGuardDepth;

    if (isTopLevel && /^if\s*\(require\.main === module\)\s*\{/.test(trimmed)) {
      requireMainGuardDepth = braceDepth + 1;
    }

    for (const pattern of patterns) {
      if (!isTopLevel || !pattern.regex.test(trimmed)) {
        continue;
      }

      if (pattern.allowInRequireMainGuard && insideRequireMainGuard) {
        continue;
      }

      violations.push({
        file: path.relative(rootDir, targetFile).replace(/\\/g, '/'),
        line: index + 1,
        pattern: pattern.name,
        snippet: trimmed,
      });
    }

    braceDepth += countBraces(line);
    if (requireMainGuardDepth !== null && braceDepth < requireMainGuardDepth) {
      requireMainGuardDepth = null;
    }
  });

  console.log(JSON.stringify({ checkedFiles: 1, violations }, null, 2));
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main();
