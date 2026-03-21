import { logger } from '@backend/shared/utils';
import { createExamService } from './exam.service';

export interface IExamAutoSubmitService {
  start(checkIntervalMs?: number): Promise<void>;
  stop(): Promise<void>;
  getStatus(): {
    isRunning: boolean;
    checkInterval: number | null;
  };
}

/** Defines the finalizer dependency used by ExamAutoSubmitService. */
export interface IExpiredParticipationFinalizer {
  finalizeExpiredParticipations(): Promise<number>;
}

type ExamAutoSubmitServiceDependencies = {
  examFinalizer: IExpiredParticipationFinalizer;
};

/** Service to handle automatic exam submission for expired exams. */
export class ExamAutoSubmitService implements IExamAutoSubmitService {
  private readonly examFinalizer: IExpiredParticipationFinalizer;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(deps: ExamAutoSubmitServiceDependencies) {
    this.examFinalizer = deps.examFinalizer;
  }

  /** Starts the auto-submit service and schedules recurring checks. */
  async start(checkIntervalMs: number = 30000): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    await this.checkAndAutoSubmitExpiredExams();

    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAndAutoSubmitExpiredExams();
      } catch (error) {
        logger.error('Error in auto-submit service:', error);
      }
    }, checkIntervalMs);
  }

  /** Stops the auto-submit interval and resets the running flag. */
  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
  }

  /** Runs one pass of expired-participation finalization with error logging. */
  private async checkAndAutoSubmitExpiredExams(): Promise<void> {
    try {
      await this.examFinalizer.finalizeExpiredParticipations();
    } catch (error) {
      logger.error('Error finalizing expired participations:', error);
    }
  }

  getStatus(): {
    isRunning: boolean;
    checkInterval: number | null;
  } {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval ? 30000 : null,
    };
  }
}

/** Creates an exam auto-submit runner wired to a fresh ExamService finalizer. */
export function createExamAutoSubmitService(): IExamAutoSubmitService {
  return new ExamAutoSubmitService({
    examFinalizer: createExamService(),
  });
}
