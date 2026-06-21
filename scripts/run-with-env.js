const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

function readDotenvValues(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(envPath));
}

function buildChildEnv(baseEnv = process.env, dotenvValues = {}) {
  const normalizedBaseEnv = Object.fromEntries(
    Object.entries(baseEnv).filter(([, value]) => value !== undefined),
  );

  return {
    ...dotenvValues,
    ...normalizedBaseEnv,
  };
}

function resolveCommand(command, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const fileExists = options.fileExists || fs.existsSync;

  if (platform !== 'win32' || path.extname(command) || command.includes('/') || command.includes('\\')) {
    return command;
  }

  const pathValue = env.PATH || env.Path || '';
  const pathExtValue = env.PATHEXT || '.COM;.EXE;.BAT;.CMD';

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of pathExtValue.split(';').filter(Boolean)) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return command;
}

function run() {
  const [, , command, ...args] = process.argv;
  if (!command) {
    console.error('Usage: node scripts/run-with-env.js <command> [...args]');
    process.exit(1);
  }

  const backendRoot = path.resolve(__dirname, '..');
  const envPath = process.env.RUN_WITH_ENV_FILE || path.join(backendRoot, '.env');
  const env = buildChildEnv(process.env, readDotenvValues(envPath));
  const child = spawn(resolveCommand(command, { env }), args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on('error', error => {
    console.error(error);
    process.exit(1);
  });
}

if (require.main === module) {
  run();
}

module.exports = {
  buildChildEnv,
  readDotenvValues,
  resolveCommand,
};
