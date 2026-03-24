import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

describe('docker compose runtime path', () => {
  it('publishes the API port to the host for the manual full-pipeline gate', () => {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const compose = YAML.parse(fs.readFileSync(composePath, 'utf8')) as {
      services?: {
        api?: {
          ports?: string[];
        };
      };
    };

    expect(compose.services?.api?.ports).toContain('3001:3001');
  });
});
