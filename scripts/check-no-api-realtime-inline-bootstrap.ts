import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const serviceFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'sse.service.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'websocket.service.ts'),
] as const;
const consumerFiles = [
  path.join(rootDir, 'apps', 'api', 'src', 'routes', 'submission.routes.ts'),
  path.join(rootDir, 'apps', 'api', 'src', 'services', 'notification.service.ts'),
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
    name: 'sse-inline-redis-bootstrap',
    regex: /this\.subscriber\s*=\s*new\s+Redis\(/,
  },
  {
    name: 'sse-inline-service-construction',
    regex: /sseService\s*=\s*new\s+SseService\(/,
  },
  {
    name: 'websocket-inline-socketio-bootstrap',
    regex: /this\.io\s*=\s*new\s+SocketIOServer\(/,
  },
  {
    name: 'websocket-inline-service-construction',
    regex: /websocketService\s*=\s*new\s+WebSocketService\(/,
  },
];

const consumerPatterns: Pattern[] = [
  {
    name: 'direct-sse-service-construction',
    regex: /\bnew\s+SseService\(/,
  },
  {
    name: 'direct-websocket-service-construction',
    regex: /\bnew\s+WebSocketService\(/,
  },
];

/** Scans a file for stale realtime bootstrap patterns that should be removed in Slice 22. */
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

/** Runs the Slice 22 realtime bootstrap guard and exits non-zero when stale patterns remain. */
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