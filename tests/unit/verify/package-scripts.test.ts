import fs from 'node:fs';
import path from 'node:path';

describe('package verification scripts', () => {
  it('wires the pre-merge and full-pipeline commands to real existing entry points', () => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      'verify:pre-merge-gate': 'ts-node scripts/verify/pre-merge-gate.ts',
      'verify:full-pipeline:e2e': 'ts-node apps/api/tests/e2e/full_pipeline.test.ts',
      'start:test': 'npm run verify:full-pipeline:e2e',
      'start:all': 'concurrently "npm run start:api" "npm run start:worker" "npm run start:sandbox"',
    });
  });
});
