import 'dotenv/config';

import { DatabaseService } from '@backend/shared/db/connection';
import {
  createProctoringPilotEvidenceService,
  formatPilotEvidenceReport,
} from '@backend/api/services/proctoring/proctoring-pilot-evidence.service';

function readArg(name: string): string {
  const prefix = `--${name}=`;
  const fromArg = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length).trim();
  const fromEnv = process.env[`PROCTORING_${name.replace(/-/g, '_').toUpperCase()}`]?.trim();
  const value = fromArg || fromEnv;
  if (!value) {
    throw new Error(`Missing required argument --${name}=...`);
  }
  return value;
}

async function main(): Promise<void> {
  const examId = readArg('exam-id');
  const modelVersion = readArg('model-version');

  await DatabaseService.connect();
  try {
    const evidence = await createProctoringPilotEvidenceService().collect({
      examId,
      modelVersion,
    });

    console.log(formatPilotEvidenceReport(evidence));
    if (!evidence.readyForAiAdvisory) {
      process.exitCode = 2;
    }
  } finally {
    await DatabaseService.disconnect();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
