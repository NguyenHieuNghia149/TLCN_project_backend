import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

const ENV_LOADED_KEY = '__backend_env_loaded__';

const globalState = globalThis as typeof globalThis & {
  [ENV_LOADED_KEY]?: boolean;
};

if (!globalState[ENV_LOADED_KEY]) {
  const candidatePaths = [
    process.env.DOTENV_CONFIG_PATH,
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
    '/app/.env',
  ].filter((value): value is string => Boolean(value));

  const envPath = candidatePaths.find(candidate => fs.existsSync(candidate));

  if (envPath) {
    config({ path: envPath });
  } else {
    config();
  }

  globalState[ENV_LOADED_KEY] = true;
}

export {};
