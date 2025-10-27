const { execSync } = require('child_process');

const ports = [3000, 3001, 4000];

console.log('🔍 Checking for processes using ports 3001, 4000...');

for (const port of ports) {
  try {
    // Get PID using the port
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    
    if (result) {
      const lines = result.trim().split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          
          try {
            console.log(`🛑 Killing process ${pid} on port ${port}...`);
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(`✅ Successfully killed process ${pid}`);
          } catch (error) {
            console.log(`⚠️  Could not kill process ${pid}`);
          }
        }
      }
    }
  } catch (error) {
    // Port not in use
  }
}

console.log('✅ Port cleanup complete');


