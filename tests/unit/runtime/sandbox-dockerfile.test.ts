import fs from 'node:fs';
import path from 'node:path';

describe('sandbox Dockerfile runtime dependencies', () => {
  it('installs nlohmann-json3-dev for the C++ JSON wrapper', () => {
    const dockerfilePath = path.resolve(process.cwd(), 'docker', 'Dockerfile.sandbox');
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(dockerfile).toContain('nlohmann-json3-dev');
  });
});
