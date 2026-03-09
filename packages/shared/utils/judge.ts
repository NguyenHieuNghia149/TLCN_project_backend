import { ESubmissionStatus } from '@backend/shared/types';

export class JudgeUtils {
  /**
   * Determines the final submission status based on test case results.
   */
  static determineFinalStatus(summary: any, results: any[]): ESubmissionStatus {
    if (summary.passed === summary.total) {
      return ESubmissionStatus.ACCEPTED;
    }

    // Check for specific error types in the results
    for (const result of results) {
      if (result.error) {
        const errorMsg = result.error.toLowerCase();

        if (errorMsg.includes('timeout') || errorMsg.includes('time limit exceeded')) {
          return ESubmissionStatus.TIME_LIMIT_EXCEEDED;
        }
        if (errorMsg.includes('memory') || errorMsg.includes('memory limit exceeded')) {
          return ESubmissionStatus.MEMORY_LIMIT_EXCEEDED;
        }
        if (errorMsg.includes('compilation') || errorMsg.includes('compilation failed')) {
          return ESubmissionStatus.COMPILATION_ERROR;
        }

        return ESubmissionStatus.RUNTIME_ERROR;
      }
    }

    return ESubmissionStatus.WRONG_ANSWER;
  }

  /**
   * Calculates the final score percentage (0-100) based on test case points.
   */
  static calculateScore(
    results: Array<{ isPassed?: boolean; ok?: boolean; [key: string]: any }>,
    testcases: Array<{ point: number; [key: string]: any }>
  ): number {
    let totalScore = 0;
    let maxScore = 0;

    results.forEach((result, index) => {
      const testcase = testcases[index];
      if (testcase) {
        maxScore += testcase.point;
        // Handle both Worker (ok) and SubmissionService (isPassed) result formats
        const isPassed = result.ok !== undefined ? result.ok : result.isPassed;
        if (isPassed) {
          totalScore += testcase.point;
        }
      }
    });

    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  }
}
