import crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseService, db } from '@backend/shared/db/connection';
import { languages, problems, resultSubmissions, submissions, testcases, users } from '@backend/shared/db/schema';
import {
  ESubmissionStatus,
  FunctionSignature,
  ProblemVisibility,
} from '@backend/shared/types';
import { SubmissionResult } from '@backend/shared/validations/submission.validation';
import { SubmissionRepository } from '@backend/api/repositories/submission.repository';

type CleanupState = {
  submissionIds: string[];
  problemIds: string[];
  userIds: string[];
};

const signature: FunctionSignature = {
  name: 'twoSum',
  args: [
    { name: 'nums', type: { type: 'array', items: { type: 'integer' } } },
    { name: 'target', type: { type: 'integer' } },
  ],
  returnType: { type: 'array', items: { type: 'integer' } },
};

function createCleanupState(): CleanupState {
  return { submissionIds: [], problemIds: [], userIds: [] };
}

describe('SubmissionRepository.finalizeSubmissionResult', () => {
  const repository = new SubmissionRepository();
  let cleanup = createCleanupState();

  beforeAll(async () => {
    await DatabaseService.connect();
  });

  afterEach(async () => {
    if (cleanup.submissionIds.length > 0) {
      await db
        .delete(resultSubmissions)
        .where(inArray(resultSubmissions.submissionId, cleanup.submissionIds));
      await db.delete(submissions).where(inArray(submissions.id, cleanup.submissionIds));
    }

    if (cleanup.problemIds.length > 0) {
      await db.delete(testcases).where(inArray(testcases.problemId, cleanup.problemIds));
      await db.delete(problems).where(inArray(problems.id, cleanup.problemIds));
    }

    if (cleanup.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, cleanup.userIds));
    }

    cleanup = createCleanupState();
  });

  afterAll(async () => {
    await DatabaseService.disconnect();
  });

  async function createUser() {
    const email = `submission-finalization-${crypto.randomUUID()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({
        email,
        password: 'Password1!',
        firstName: 'Submission',
        lastName: 'Tester',
      })
      .returning();

    if (!user) {
      throw new Error('Failed to create test user');
    }

    cleanup.userIds.push(user.id);
    return user;
  }


  async function createProblemWithTestcases(points: number[]) {
    const [problem] = await db
      .insert(problems)
      .values({
        title: `Submission finalization ${crypto.randomUUID()}`,
        difficult: 'easy',
        visibility: ProblemVisibility.PUBLIC,
        functionSignature: signature,
      })
      .returning();

    if (!problem) {
      throw new Error('Failed to create test problem');
    }

    cleanup.problemIds.push(problem.id);

    const testcasePayloads = points.map((point, index) => ({
      problemId: problem.id,
      inputJson: { nums: [2, 7, 11, 15], target: index + 9 },
      outputJson: [0, 1],
      point,
      isPublic: index === 0,
    }));

    const createdTestcases = await db
      .insert(testcases)
      .values(
        testcasePayloads.map(payload => ({
          problemId: payload.problemId,
          inputJson: payload.inputJson,
          outputJson: payload.outputJson,
          point: payload.point,
          isPublic: payload.isPublic,
        }))
      )
      .returning();

    return { problem, testcases: createdTestcases };
  }

  async function createSubmission(input: {
    userId: string;
    problemId: string;
    status?: ESubmissionStatus;
    examParticipationId?: string | null;
  }) {
    const [pythonLanguage] = await db
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.key, 'python'))
      .limit(1);

    if (!pythonLanguage) {
      throw new Error('Missing seeded language row for python');
    }

    const [submission] = await db
      .insert(submissions)
      .values({
        sourceCode: 'print(1)',
        languageId: pythonLanguage.id,
        problemId: input.problemId,
        userId: input.userId,
        status: input.status ?? ESubmissionStatus.PENDING,
        examParticipationId: input.examParticipationId ?? null,
      })
      .returning();

    if (!submission) {
      throw new Error('Failed to create test submission');
    }

    cleanup.submissionIds.push(submission.id);
    return submission;
  }

  function buildAcceptedResult(testcaseIds: string[]): SubmissionResult {
    return {
      passed: testcaseIds.length,
      total: testcaseIds.length,
      results: testcaseIds.map(testcaseId => ({
        testcaseId,
        input: 'nums: [2, 7, 11, 15]\ntarget: 9',
        expectedOutput: '[0,1]',
        actualOutput: '[0,1]',
        isPassed: true,
        executionTime: 12,
        memoryUse: 128,
        error: null,
      })),
    };
  }

  async function getUserRankingPoint(userId: string): Promise<number> {
    const [user] = await db.select({ rankingPoint: users.rankingPoint }).from(users).where(eq(users.id, userId));
    return user?.rankingPoint ?? 0;
  }

  async function getSubmissionStatus(submissionId: string): Promise<string | null> {
    const [submission] = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, submissionId));
    return submission?.status ?? null;
  }

  async function getResultRows(submissionId: string) {
    return db
      .select()
      .from(resultSubmissions)
      .where(eq(resultSubmissions.submissionId, submissionId));
  }

  it('prevents concurrent accepted finalizations from double-awarding ranking points or corrupting results', async () => {
    const user = await createUser();
    const { problem, testcases: createdTestcases } = await createProblemWithTestcases([30, 70]);
    const submissionA = await createSubmission({ userId: user.id, problemId: problem.id });
    const submissionB = await createSubmission({ userId: user.id, problemId: problem.id });
    const acceptedResult = buildAcceptedResult(createdTestcases.map(testcase => testcase.id));

    const [resultA, resultB] = await Promise.all([
      repository.finalizeSubmissionResult({
        submissionId: submissionA.id,
        status: ESubmissionStatus.ACCEPTED,
        result: acceptedResult,
      }),
      repository.finalizeSubmissionResult({
        submissionId: submissionB.id,
        status: ESubmissionStatus.ACCEPTED,
        result: acceptedResult,
      }),
    ]);

    expect(resultA).toEqual({ id: submissionA.id, status: ESubmissionStatus.ACCEPTED });
    expect(resultB).toEqual({ id: submissionB.id, status: ESubmissionStatus.ACCEPTED });
    await expect(getUserRankingPoint(user.id)).resolves.toBe(100);
    await expect(getResultRows(submissionA.id)).resolves.toHaveLength(2);
    await expect(getResultRows(submissionB.id)).resolves.toHaveLength(2);
  });

  it('awards testcase-sum ranking points only for the first accepted submission on a problem', async () => {
    const user = await createUser();
    const { problem, testcases: createdTestcases } = await createProblemWithTestcases([40, 60]);
    const firstSubmission = await createSubmission({ userId: user.id, problemId: problem.id });
    const secondSubmission = await createSubmission({ userId: user.id, problemId: problem.id });
    const acceptedResult = buildAcceptedResult(createdTestcases.map(testcase => testcase.id));

    await repository.finalizeSubmissionResult({
      submissionId: firstSubmission.id,
      status: ESubmissionStatus.ACCEPTED,
      result: acceptedResult,
    });
    const rankingAfterFirst = await getUserRankingPoint(user.id);

    await repository.finalizeSubmissionResult({
      submissionId: secondSubmission.id,
      status: ESubmissionStatus.ACCEPTED,
      result: acceptedResult,
    });
    const rankingAfterSecond = await getUserRankingPoint(user.id);

    expect(rankingAfterFirst).toBe(100);
    expect(rankingAfterSecond).toBe(100);
  });

  it('rolls back delete-and-recreate result rows when insertion fails', async () => {
    const user = await createUser();
    const { problem, testcases: createdTestcases } = await createProblemWithTestcases([100]);
    const submission = await createSubmission({ userId: user.id, problemId: problem.id });

    await db.insert(resultSubmissions).values({
      submissionId: submission.id,
      testcaseId: createdTestcases[0]!.id,
      actualOutput: 'old-output',
      isPassed: false,
      executionTime: 3,
      memoryUse: 32,
      error: 'old-error',
    });

    const invalidResult: SubmissionResult = {
      passed: 0,
      total: 1,
      results: [
        {
          testcaseId: crypto.randomUUID(),
          input: 'nums: [2, 7, 11, 15]\ntarget: 9',
          expectedOutput: '[0,1]',
          actualOutput: '[1,0]',
          isPassed: false,
          executionTime: 9,
          memoryUse: 64,
          error: 'Wrong answer',
        },
      ],
    };

    await expect(
      repository.finalizeSubmissionResult({
        submissionId: submission.id,
        status: ESubmissionStatus.WRONG_ANSWER,
        result: invalidResult,
      })
    ).rejects.toThrow();

    const preservedRows = await getResultRows(submission.id);
    expect(preservedRows).toHaveLength(1);
    expect(preservedRows[0]?.actualOutput).toBe('old-output');
    await expect(getSubmissionStatus(submission.id)).resolves.toBe(ESubmissionStatus.PENDING);
  });

  it('is idempotent after the first terminal transition', async () => {
    const user = await createUser();
    const { problem, testcases: createdTestcases } = await createProblemWithTestcases([25, 75]);
    const submission = await createSubmission({ userId: user.id, problemId: problem.id });
    const acceptedResult = buildAcceptedResult(createdTestcases.map(testcase => testcase.id));

    const first = await repository.finalizeSubmissionResult({
      submissionId: submission.id,
      status: ESubmissionStatus.ACCEPTED,
      result: acceptedResult,
    });

    const second = await repository.finalizeSubmissionResult({
      submissionId: submission.id,
      status: ESubmissionStatus.ACCEPTED,
      result: acceptedResult,
    });

    expect(first).toEqual({ id: submission.id, status: ESubmissionStatus.ACCEPTED });
    expect(second).toBeNull();
    await expect(getResultRows(submission.id)).resolves.toHaveLength(2);
    await expect(getUserRankingPoint(user.id)).resolves.toBe(100);
  });
});



