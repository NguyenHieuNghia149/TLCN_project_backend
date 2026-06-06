import { JudgeUtils } from '@backend/shared/utils';
import { ESubmissionStatus } from '@backend/shared/types';

describe('JudgeUtils', () => {
  describe('determineFinalStatus', () => {
    it('should return ACCEPTED if all test cases passed', () => {
      const summary = { passed: 2, total: 2 };
      const results = [
        { ok: true, error: null },
        { ok: true, error: null },
      ];
      expect(JudgeUtils.determineFinalStatus(summary, results)).toBe(ESubmissionStatus.ACCEPTED);
    });

    it('should return TIME_LIMIT_EXCEEDED if a result contains timeout error', () => {
      const summary = { passed: 0, total: 1 };
      const results = [{ ok: false, error: 'Execution timeout exceeded 1000ms' }];
      expect(JudgeUtils.determineFinalStatus(summary, results)).toBe(
        ESubmissionStatus.TIME_LIMIT_EXCEEDED
      );
    });

    it('should return COMPILATION_ERROR if a result contains compilation failed', () => {
      const summary = { passed: 0, total: 1 };
      const results = [{ ok: false, error: 'Compilation Error: missing semicolon' }];
      expect(JudgeUtils.determineFinalStatus(summary, results)).toBe(
        ESubmissionStatus.COMPILATION_ERROR
      );
    });

    it('should return WRONG_ANSWER if no specific error but not all passed', () => {
      const summary = { passed: 1, total: 2 };
      const results = [
        { ok: true, error: null },
        { ok: false, error: null },
      ];
      expect(JudgeUtils.determineFinalStatus(summary, results)).toBe(
        ESubmissionStatus.WRONG_ANSWER
      );
    });

    it('should return SYSTEM_ERROR when there are no test results', () => {
      expect(JudgeUtils.determineFinalStatus({ passed: 0, total: 0 }, [])).toBe(
        ESubmissionStatus.SYSTEM_ERROR
      );
    });

    it('should apply global priority over first failing result order', () => {
      const summary = { passed: 0, total: 2 };

      expect(
        JudgeUtils.determineFinalStatus(summary, [
          { ok: false, error: null },
          { ok: false, error: 'Execution timeout exceeded 1000ms' },
        ])
      ).toBe(ESubmissionStatus.TIME_LIMIT_EXCEEDED);

      expect(
        JudgeUtils.determineFinalStatus(summary, [
          { ok: false, error: 'Process exited with code 1' },
          { ok: false, error: 'Compilation Error: missing semicolon' },
        ])
      ).toBe(ESubmissionStatus.COMPILATION_ERROR);

      expect(
        JudgeUtils.determineFinalStatus(summary, [
          { ok: false, error: null },
          { ok: false, error: 'Memory limit exceeded' },
        ])
      ).toBe(ESubmissionStatus.MEMORY_LIMIT_EXCEEDED);
    });

    it('should honor explicit per-result statuses when available', () => {
      expect(
        JudgeUtils.determineFinalStatus(
          { passed: 0, total: 2 },
          [
            { ok: false, status: 'WRONG_ANSWER' },
            { ok: false, status: 'runtime_error' },
          ]
        )
      ).toBe(ESubmissionStatus.RUNTIME_ERROR);
    });
  });

  describe('calculateScore', () => {
    const testcases = [
      { id: '1', point: 30 },
      { id: '2', point: 70 },
    ];

    it('should return 100 if all test cases passed', () => {
      const results = [{ ok: true }, { ok: true }];
      expect(JudgeUtils.calculateScore(results, testcases)).toBe(100);
    });

    it('should calculate partial score correctly', () => {
      const results = [{ ok: true }, { ok: false }];
      // 30 / (30 + 70) * 100 = 30
      expect(JudgeUtils.calculateScore(results, testcases)).toBe(30);
    });

    it('should handle isPassed property (SubmissionService format)', () => {
      const results = [{ isPassed: false }, { isPassed: true }];
      // 70 / 100 * 100 = 70
      expect(JudgeUtils.calculateScore(results, testcases)).toBe(70);
    });

    it('should return 0 if no test cases passed', () => {
      const results = [{ ok: false }, { ok: false }];
      expect(JudgeUtils.calculateScore(results, testcases)).toBe(0);
    });
  });
});
