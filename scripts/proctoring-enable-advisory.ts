import 'dotenv/config';
import { DatabaseService } from '@backend/shared/db/connection';
import { createProctoringSettingsService } from '@backend/api/services/proctoring/proctoring-settings.service';

const EXAM_ID = process.argv.find(a => a.startsWith('--exam-id='))?.split('=')[1];
const MODEL_VERSION = process.argv.find(a => a.startsWith('--model-version='))?.split('=')[1] ?? 'iforest-browser-v1.0.0';

if (!EXAM_ID) {
  console.error('Missing --exam-id=<uuid>');
  process.exit(1);
}

async function main(): Promise<void> {
  await DatabaseService.connect();
  try {
    const service = createProctoringSettingsService();
    const result = await service.updateSettings(EXAM_ID!, undefined, {
      aiAnomalyEnabled: true,
      aiAdvisoryVisible: true,
      aiMinimumEvaluationStatus: 'passed_gate',
      defaultAnomalyModelVersion: MODEL_VERSION,
      aiShadowMode: false,
    });

    console.log(`✅ AI advisory enabled for exam ${EXAM_ID}`);
    console.log(`   aiAdvisoryVisible:         ${result.aiAdvisoryVisible}`);
    console.log(`   aiAnomalyEnabled:          ${result.aiAnomalyEnabled}`);
    console.log(`   aiMinimumEvaluationStatus: ${result.aiMinimumEvaluationStatus}`);
    console.log(`   defaultAnomalyModelVersion: ${result.defaultAnomalyModelVersion}`);
    console.log(`   aiShadowMode:              ${result.aiShadowMode}`);
  } finally {
    await DatabaseService.disconnect();
  }
}

void main().catch(error => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
