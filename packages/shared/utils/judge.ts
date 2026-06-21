import { ESubmissionStatus, normalizeSubmissionStatus } from '@backend/shared/types';

const FINAL_STATUS_PRIORITY = [
  ESubmissionStatus.COMPILATION_ERROR,
  ESubmissionStatus.TIME_LIMIT_EXCEEDED,
  ESubmissionStatus.MEMORY_LIMIT_EXCEEDED,
  ESubmissionStatus.RUNTIME_ERROR,
  ESubmissionStatus.WRONG_ANSWER,
];

const NON_FINAL_RESULT_STATUSES = new Set<ESubmissionStatus>([
  ESubmissionStatus.PENDING,
  ESubmissionStatus.RUNNING,
]);

export class JudgeUtils {
  /**
   * Determines the final submission status based on test case results.
   */
  static determineFinalStatus(_summary: any, results: any[]): ESubmissionStatus {
    if (!results.length) {
      return ESubmissionStatus.SYSTEM_ERROR;
    }

    const failedStatuses = new Set<ESubmissionStatus>();
    for (const result of results) {
      const status = this.determineTestCaseStatus(result);
      if (status !== ESubmissionStatus.ACCEPTED) {
        failedStatuses.add(status);
      }
    }

    if (failedStatuses.size === 0) {
      return ESubmissionStatus.ACCEPTED;
    }

    for (const status of FINAL_STATUS_PRIORITY) {
      if (failedStatuses.has(status)) {
        return status;
      }
    }

    return ESubmissionStatus.WRONG_ANSWER;
  }

  static determineTestCaseStatus(result: any): ESubmissionStatus {
    const explicitStatus = normalizeSubmissionStatus(result?.status);
    if (explicitStatus && !NON_FINAL_RESULT_STATUSES.has(explicitStatus)) {
      return explicitStatus;
    }

    if (result?.ok === true || result?.isPassed === true) {
      return ESubmissionStatus.ACCEPTED;
    }

    const errorMsg = `${result?.error ?? ''}\n${result?.stderr ?? ''}\n${result?.message ?? ''}`
      .toLowerCase();

    if (errorMsg.includes('timeout') || errorMsg.includes('time limit exceeded')) {
      return ESubmissionStatus.TIME_LIMIT_EXCEEDED;
    }

    if (errorMsg.includes('memory') || errorMsg.includes('out of memory')) {
      return ESubmissionStatus.MEMORY_LIMIT_EXCEEDED;
    }

    if (this.looksLikeCompilationFailure(errorMsg)) {
      return ESubmissionStatus.COMPILATION_ERROR;
    }

    if (
      errorMsg.includes('runtime') ||
      errorMsg.includes('process exited with code') ||
      errorMsg.includes('wrapper envelope missing or malformed') ||
      errorMsg.includes('invalid envelope') ||
      errorMsg.includes('segmentation fault') ||
      errorMsg.includes('exception')
    ) {
      return ESubmissionStatus.RUNTIME_ERROR;
    }

    return ESubmissionStatus.WRONG_ANSWER;
  }

  private static looksLikeCompilationFailure(normalized: string): boolean {
    const sourceCoordinatePattern =
      /(?:^|\n)(?:wrapper|solution|main)\.(?:c|cc|cpp|cxx|java|kt|py):\d+/;

    return (
      normalized.includes('compilation') ||
      normalized.includes('compile') ||
      normalized.includes('syntaxerror:') ||
      sourceCoordinatePattern.test(normalized) ||
      (normalized.includes('error:') &&
        (normalized.includes('note:') || normalized.includes('in function')))
    );
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
