import { ExamParticipationRepository } from '@/repositories/examParticipation.repository';
import { ExamRepository } from '@/repositories/exam.repository';
import { ExamService } from './exam.service';
import { db } from '@/database/connection';
import { examParticipations, exam } from '@/database/schema';
import { lt, and, eq } from 'drizzle-orm';

/**
 * Service to handle automatic exam submission for expired exams
 */
export class ExamAutoSubmitService {
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
      console.log('Exam auto-submit service is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Exam Auto-Submit Service...');

    // Run initial check
    await this.checkAndAutoSubmitExpiredExams();

    // Set up periodic checks
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAndAutoSubmitExpiredExams();
      } catch (error) {
        console.error('Error in auto-submit check:', error);
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
    console.log('Exam auto-submit service stopped');
  }

  /**
   * Check for expired participations and auto-submit them
   */
  private async checkAndAutoSubmitExpiredExams(): Promise<void> {
    try {
      // Delegate to central finalizer which computes effective end time per participation
      // This ensures we catch participations that expired by start+duration even when exam.endDate
      // hasn't passed yet (previous implementation only checked exam.endDate).
      const finalized = await this.examService.finalizeExpiredParticipations();
      if (finalized && finalized > 0) {
        console.log(`Auto-finalizer completed: finalized ${finalized} participations`);
      }
    } catch (error) {
      console.error('Error checking for expired exams:', error);
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

// Singleton instance
export const examAutoSubmitService = new ExamAutoSubmitService();
