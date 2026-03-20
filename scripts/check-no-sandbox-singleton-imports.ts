import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const targets = [
  {
    file: path.join(rootDir, 'apps', 'sandbox', 'src', 'sandbox.controller.ts'),
    patterns: [
      { name: 'sandbox-service-singleton-import', regex: /import\s+.*\bsandboxService\b.*from\s+['"].\/sandbox\.service['"]/ },
      { name: 'sandbox-service-singleton-import', regex: /import\s+.*\bsandboxService\b.*from\s+['"]\.\.\/sandbox\.service['"]/ },
    ],
  },
  {
    file: path.join(rootDir, 'apps', 'sandbox', 'src', 'sandbox.routes.ts'),
    patterns: [
      { name: 'sandbox-service-singleton-import', regex: /import\s+.*\bsandboxService\b.*from\s+['"].\/sandbox\.service['"]/ },
      { name: 'top-level-router', regex: /^const\s+router\s*=\s*Router\(/ },
      { name: 'top-level-controller', regex: /^const\s+sandboxController\s*=\s*new\s+SandboxController\(/ },
      { name: 'top-level-rate-limit', regex: /^const\s+sandboxRateLimit\s*=\s*rateLimitMiddleware\(/ },
    ],
  },
  {
    file: path.join(rootDir, 'apps', 'sandbox', 'src', 'grpc', 'server.ts'),
    patterns: [
      { name: 'sandbox-service-singleton-import', regex: /import\s+.*\bsandboxService\b.*from\s+['"]\.\.\/sandbox\.service['"]/ },
      { name: 'top-level-proto-definition', regex: /^const\s+packageDefinition\s*=\s*protoLoader\.loadSync\(/ },
      { name: 'top-level-proto-cache', regex: /^const\s+judgeProto\s*=\s*grpc\.loadPackageDefinition\(/ },
    ],
  },
  {
    file: path.join(rootDir, 'apps', 'sandbox', 'src', 'sandbox.server.ts'),
    patterns: [
      { name: 'sandbox-service-singleton-import', regex: /import\s+.*\bsandboxService\b.*from\s+['"].\/sandbox\.service['"]/ },
      { name: 'top-level-dotenv-config', regex: /^config\(/ },
      { name: 'top-level-app', regex: /^const\s+app\s*=\s*express\(/ },
      { name: 'top-level-http-server', regex: /^const\s+server\s*=\s*createServer\(/ },
      { name: 'top-level-http-listen', regex: /^server\.listen\(/ },
      { name: 'top-level-grpc-start', regex: /^startGrpcServer\(/ },
      { name: 'top-level-process-handler', regex: /^process\.on\(/ },
      { name: 'top-level-process-handler', regex: /^process\.once\(/ },
    ],
  },
] as const;

type Violation = {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
};

function main(): void {
  const violations: Violation[] = [];

  for (const target of targets) {
    if (!fs.existsSync(target.file)) {
      continue;
    }

    const content = fs.readFileSync(target.file, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const pattern of target.patterns) {
        if (!pattern.regex.test(line)) {
          continue;
        }

        violations.push({
          file: path.relative(rootDir, target.file).replace(/\\/g, '/'),
          line: index + 1,
          pattern: pattern.name,
          snippet: line.trim(),
        });
      }
    });
  }

  console.log(JSON.stringify({ checkedFiles: targets.length, violations }, null, 2));
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main();
