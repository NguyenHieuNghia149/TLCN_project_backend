import fs from 'fs';
import path from 'path';

describe('controller async error forwarding guard', () => {
  it('does not keep controller try/catch blocks that only forward to next(error)', () => {
    const controllersRoot = path.resolve(__dirname, '../../../apps/api/src/controllers');
    const controllerFiles: string[] = [];
    const stack = [controllersRoot];

    while (stack.length > 0) {
      const current = stack.pop() as string;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith('.ts')) {
          controllerFiles.push(fullPath);
        }
      }
    }

    const passThroughCatchPattern =
      /catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{\s*next\(\s*\1\s*\);\s*\}/g;

    const offenders = controllerFiles
      .map(filePath => {
        const content = fs.readFileSync(filePath, 'utf8');
        const matches = [...content.matchAll(passThroughCatchPattern)].length;
        return matches > 0 ? `${path.relative(controllersRoot, filePath)} (${matches})` : null;
      })
      .filter((value): value is string => value !== null);

    expect(offenders).toEqual([]);
  });
});
