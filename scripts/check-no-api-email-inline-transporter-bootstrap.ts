import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const serviceFiles = [path.join(rootDir, 'apps', 'api', 'src', 'services', 'email.service.ts')] as const;
const consumerFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'auth.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'auth.routes.ts'),
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
    name: 'email-constructor-inline-transporter-bootstrap',
    regex: /this\.transporter\s*=\s*nodemailer\.createTransport\(/,
  },
  {
    name: 'email-constructor-inline-transporter-new',
    regex: /this\.transporter\s*=\s*new\s+\w*Transport\w*\(/,
  },
  {
    name: 'email-dynamic-import',
    regex: /await\s+import\(/,
  },
];

const consumerPatterns: Pattern[] = [
  {
    name: 'auth-email-service-direct-instantiation',
    regex: /\bnew\s+EMailService\(/,
  },
];

/** Scans a file for stale email bootstrap patterns that should be removed in Slice 24. */
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

/** Runs the Slice 24 email bootstrap guard and exits non-zero when stale patterns remain. */
function main(): void {
  const violations = [
    ...serviceFiles.flatMap(filePath => scanFile(filePath, servicePatterns)),
    ...consumerFiles.flatMap(filePath => scanFile(filePath, consumerPatterns)),
  ];

  console.log(
    JSON.stringify(
      {
        checkedFiles: serviceFiles.length + consumerFiles.length,
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
