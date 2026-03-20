import { logger } from '@backend/shared/utils';
import { ExamParticipationRepository } from '../repositories/examParticipation.repository';
import { ExamRepository } from '../repositories/exam.repository';
import { ExamService } from './exam.service';

export interface IExamAutoSubmitService {
  start(checkIntervalMs?: number): Promise<void>;
  stop(): Promise<void>;
  getStatus(): {
    isRunning: boolean;
    checkInterval: number | null;
  };
}

/**
 * Service to handle automatic exam submission for expired exams
 */
export class ExamAutoSubmitService implements IExamAutoSubmitService {
  private examParticipationRepository: ExamParticipationRepository;
  private examRepository: ExamRepository;
  private examService: ExamService;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.examParticipationRepository = new ExamParticipationRepository();
    this.examRepository = new ExamRepository();
    this.examService = new ExamService();
  }

  /**
   * Start the auto-submit service
   * Checks for expired exams every 30 seconds
   */
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

  /**
   * Stop the auto-submit service
   */
  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Check for expired participations and auto-submit them
   */
  private async checkAndAutoSubmitExpiredExams(): Promise<void> {
    try {
      await this.examService.finalizeExpiredParticipations();
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

/** Creates an exam auto-submit service instance for startup code without a module singleton. */
export function createExamAutoSubmitService(): IExamAutoSubmitService {
  return new ExamAutoSubmitService();
}
