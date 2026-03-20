import { db } from '@backend/shared/db/connection';
import { submissions } from '@backend/shared/db/schema';
import { getJudgeQueueService } from '@backend/shared/runtime/judge-queue';
import { ESubmissionStatus } from '@backend/shared/types';
import { logger } from '@backend/shared/utils';
import { and, eq, lt } from 'drizzle-orm';
import cron from 'node-cron';

export interface ISubmissionRecoveryService {
  requeuePendingSubmission(submissionId: string): Promise<boolean>;
}

const WATCHDOG_SCHEDULE = '*/5 * * * *';
const WATCHDOG_THRESHOLD_MS = 5 * 60 * 1000;

let isWatchdogRunning = false;
let isWatchdogInitialized = false;
let submissionRecoveryService: ISubmissionRecoveryService | null = null;

async function reconcileOrphanedSubmissions(): Promise<void> {
  if (isWatchdogRunning || !submissionRecoveryService) {
    return;
  }

  isWatchdogRunning = true;

  try {
    const cutoff = new Date(Date.now() - WATCHDOG_THRESHOLD_MS);

    const orphanedSubmissions = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.status, ESubmissionStatus.PENDING),
          lt(submissions.submittedAt, cutoff)
        )
      );

    let recoveredCount = 0;

    for (const submission of orphanedSubmissions) {
      try {
        const existingJob = await getJudgeQueueService().getJobById(submission.id);

        if (existingJob) {
          continue;
        }

        const recovered = await submissionRecoveryService.requeuePendingSubmission(submission.id);

        if (recovered) {
          recoveredCount += 1;
        }
      } catch (error) {
        logger.error(`Watchdog failed to recover submission ${submission.id}:`, error);
      }
    }

    if (recoveredCount > 0) {
      logger.warn(`Watchdog recovered [${recoveredCount}] orphaned submissions`);
    }
  } catch (error) {
    logger.error('Watchdog reconciliation failed:', error);
  } finally {
    isWatchdogRunning = false;
  }
}

/** Initializes the watchdog cron with an injected submission recovery dependency. */
export function initializeWatchdogCron(
  injectedSubmissionRecoveryService: ISubmissionRecoveryService
): void {
  if (isWatchdogInitialized) {
    return;
  }

  submissionRecoveryService = injectedSubmissionRecoveryService;

  cron.schedule(WATCHDOG_SCHEDULE, () => {
    void reconcileOrphanedSubmissions();
  });

  isWatchdogInitialized = true;
  logger.info(`Watchdog cron initialized on schedule ${WATCHDOG_SCHEDULE}`);
}
