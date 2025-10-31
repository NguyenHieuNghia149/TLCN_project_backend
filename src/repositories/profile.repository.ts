import { db } from '@/database/connection';
import { submissions, SubmissionEntity } from '@/database/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface UserStatistics {
  totalSubmissions: number;
  acceptedSubmissions: number;
  wrongAnswerSubmissions: number;
  timeLimitExceededSubmissions: number;
  memoryLimitExceededSubmissions: number;
  runtimeErrorSubmissions: number;
  compilationErrorSubmissions: number;
  totalProblemsSolved: number;
  totalProblemsAttempted: number;
  acceptanceRate: number;
}

export class ProfileRepository {
  protected db = db;

  async getUserStatistics(userId: string): Promise<UserStatistics> {
    // Get all submissions by status
    const allSubmissions = await this.db
      .select({
        status: submissions.status,
        problemId: submissions.problemId,
      })
      .from(submissions)
      .where(eq(submissions.userId, userId));

    // Count submissions by status
    const totalSubmissions = allSubmissions.length;
    const acceptedSubmissions = allSubmissions.filter((s) => s.status === 'ACCEPTED').length;
    const wrongAnswerSubmissions = allSubmissions.filter((s) => s.status === 'WRONG_ANSWER').length;
    const timeLimitExceededSubmissions = allSubmissions.filter(
      (s) => s.status === 'TIME_LIMIT_EXCEEDED'
    ).length;
    const memoryLimitExceededSubmissions = allSubmissions.filter(
      (s) => s.status === 'MEMORY_LIMIT_EXCEEDED'
    ).length;
    const runtimeErrorSubmissions = allSubmissions.filter((s) => s.status === 'RUNTIME_ERROR')
      .length;
    const compilationErrorSubmissions = allSubmissions.filter(
      (s) => s.status === 'COMPILATION_ERROR'
    ).length;

    // Get unique problems attempted
    const problemsAttempted = new Set(allSubmissions.map((s) => s.problemId));
    const totalProblemsAttempted = problemsAttempted.size;

    // Get problems solved (with at least one ACCEPTED submission)
    const problemsSolved = new Set(
      allSubmissions.filter((s) => s.status === 'ACCEPTED').map((s) => s.problemId)
    );
    const totalProblemsSolved = problemsSolved.size;

    // Calculate acceptance rate
    const acceptanceRate =
      totalSubmissions > 0 ? (acceptedSubmissions / totalSubmissions) * 100 : 0;

    return {
      totalSubmissions,
      acceptedSubmissions,
      wrongAnswerSubmissions,
      timeLimitExceededSubmissions,
      memoryLimitExceededSubmissions,
      runtimeErrorSubmissions,
      compilationErrorSubmissions,
      totalProblemsSolved,
      totalProblemsAttempted,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100, // Round to 2 decimal places
    };
  }

  async getUserSubmissionHistory(userId: string, limit: number = 10) {
    const result = await this.db
      .select()
      .from(submissions)
      .where(eq(submissions.userId, userId))
      .orderBy(sql`${submissions.submittedAt} DESC`)
      .limit(limit);

    return result;
  }

  async getUserSubmissionsByStatus(userId: string, status: string) {
    return await this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.status, status)));
  }
}

