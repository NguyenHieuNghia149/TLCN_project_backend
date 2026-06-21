const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== 'dist') {
        walkDir(dirPath, callback);
      }
    } else {
      callback(dirPath);
    }
  });
}

const targetDirs = ['apps/api/src', 'apps/worker/src', 'apps/sandbox/src', 'packages/shared'];

let modifiedCount = 0;

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  walkDir(dir, filepath => {
    if (filepath.endsWith('.ts')) {
      let content = fs.readFileSync(filepath, 'utf8');
      let originalContent = content;

      // 1. Replace relative imports (e.g. `../../database/xyz`, `../utils/abc`)
      content = content.replace(/from\s+['"](?:\.\.\/|\.\/)+(database|enums|utils|validations)(.*?)['"]/g, (match, folder, rest) => {
        let newFolder = folder;
        if (folder === 'database') newFolder = 'db';
        if (folder === 'enums') newFolder = 'types';
        return `from '@backend/shared/${newFolder}${rest}'`;
      });

      // 2. Replace old alias imports (e.g. `@/database/xyz`, `@/utils/abc`)
      content = content.replace(/from\s+['"]@\/(database|enums|utils|validations)(.*?)['"]/g, (match, folder, rest) => {
        let newFolder = folder;
        if (folder === 'database') newFolder = 'db';
        if (folder === 'enums') newFolder = 'types';
        return `from '@backend/shared/${newFolder}${rest}'`;
      });

      // 3. Replace @judge/shared -> @backend/shared
      content = content.replace(/from\s+['"]@judge\/shared\/(.*?)['"]/g, "from '@backend/shared/$1'");
      content = content.replace(/from\s+['"]@judge\/shared['"]/g, "from '@backend/shared'");
      
      // 4. Sometimes @backend/shared/database is used -> @backend/shared/db
      content = content.replace(/from\s+['"]@backend\/shared\/database(.*?)['"]/g, "from '@backend/shared/db$1'");
      content = content.replace(/from\s+['"]@backend\/shared\/enums(.*?)['"]/g, "from '@backend/shared/types$1'");

      if (content !== originalContent) {
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`Updated imports in: ${filepath}`);
        modifiedCount++;
      }
    }
  });
});

console.log(`Migration complete. Modified ${modifiedCount} files.`);
