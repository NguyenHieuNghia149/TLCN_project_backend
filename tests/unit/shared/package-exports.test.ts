import fs from 'node:fs';
import path from 'node:path';

describe('@backend/shared package exports', () => {
  it('exports the shared http subpaths used by runtime apps', () => {
    const packageJsonPath = path.resolve(process.cwd(), 'packages', 'shared', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      exports?: Record<string, string>;
    };

    expect(packageJson.exports).toMatchObject({
      './http': './dist/http/index.js',
      './http/*': './dist/http/*.js',
    });
  });
});
