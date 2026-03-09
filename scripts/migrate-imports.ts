import * as fs from 'fs';
import * as path from 'path';

function walkDir(dir: string, callback: (filepath: string) => void) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const appsDirs = ['apps/api/src', 'apps/worker/src'];

appsDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  walkDir(dir, filepath => {
    if (filepath.endsWith('.ts')) {
      let content = fs.readFileSync(filepath, 'utf8');

      // Replace aliased paths:
      // from @/utils => @judge/shared/utils
      // from @/database => @judge/shared/db
      // from @/enums => @judge/shared/types
      // from @/config => @/config (remains same local mostly or updated based on context, but let's check)

      let updated = content
        .replace(/@\/utils([^"']*)/g, '@judge/shared/utils$1')
        .replace(/@\/database([^"']*)/g, '@judge/shared/db$1')
        .replace(/@\/enums([^"']*)/g, '@judge/shared/types$1')
        .replace(/from\s+['"](?:\.\.\/)+utils([^'"]*)['"]/g, "from '@judge/shared/utils$1'")
        .replace(/from\s+['"](?:\.\.\/)+database([^'"]*)['"]/g, "from '@judge/shared/db$1'")
        .replace(/from\s+['"](?:\.\.\/)+enums([^'"]*)['"]/g, "from '@judge/shared/types$1'")
        .replace(/@backend\/shared/g, '@judge/shared');

      if (content !== updated) {
        fs.writeFileSync(filepath, updated, 'utf8');
        console.log(`Updated: ${filepath}`);
      }
    }
  });
});
console.log('Migration complete.');
