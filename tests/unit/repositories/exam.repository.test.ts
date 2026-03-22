import {
  createExamRepository,
  ExamRepository,
} from '@backend/api/repositories/exam.repository';
import { ProblemRepository } from '@backend/api/repositories/problem.repository';
import { exam, examParticipations, examToProblems } from '@backend/shared/db/schema';

function createExamFields() {
  return {
    title: 'Midterm',
    duration: 60,
    startDate: new Date('2025-01-01T00:00:00.000Z'),
    endDate: new Date('2025-01-01T01:00:00.000Z'),
    isVisible: true,
    maxAttempts: 1,
  } as any;
}

describe('ExamRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('creates mixed existing and new challenges using the injected problem repository', async () => {
    const existingChallengeWhere = jest.fn().mockResolvedValue([{ id: 'challenge-existing' }]);
    const examInsertReturning = jest.fn().mockResolvedValue([{ id: 'exam-1' }]);
    const examInsertValues = jest.fn().mockReturnValue({ returning: examInsertReturning });
    const linksInsertReturning = jest.fn().mockResolvedValue([]);
    const linksInsertValues = jest.fn().mockReturnValue({ returning: linksInsertReturning });
    const tx = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ where: existingChallengeWhere }),
      }),
      insert: jest.fn((table: unknown) => {
        if (table === exam) {
          return { values: examInsertValues };
        }

        if (table === examToProblems) {
          return { values: linksInsertValues };
        }

        throw new Error('Unexpected insert table');
      }),
    } as any;
    const db = {
      transaction: jest.fn().mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    } as any;
    const problemRepository = {
      createProblemTransactional: jest.fn().mockResolvedValue({
        problem: { id: 'challenge-new' },
      }),
    } as any;
    const repository = new ExamRepository({ problemRepository });
    (repository as any).db = db;

    const examId = await repository.createExamWithChallenges(createExamFields(), [
      { type: 'existing', challengeId: 'challenge-existing', orderIndex: 0 },
      { type: 'new', challenge: { title: 'Two Sum' }, orderIndex: 1 },
    ]);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(problemRepository.createProblemTransactional).toHaveBeenCalledWith(
      { title: 'Two Sum' },
      tx,
    );
    expect(linksInsertValues).toHaveBeenCalledWith([
      { examId: 'exam-1', problemId: 'challenge-existing', orderIndex: 0 },
      { examId: 'exam-1', problemId: 'challenge-new', orderIndex: 1 },
    ]);
    expect(examId).toBe('exam-1');
  });

  it('deletes relations and the exam using the top-level schema import path', async () => {
    const deleteWhereOne = jest.fn().mockResolvedValue(undefined);
    const deleteWhereTwo = jest.fn().mockResolvedValue(undefined);
    const deleteWhereThreeReturning = jest.fn().mockResolvedValue([{ id: 'exam-1' }]);
    const deleteWhereThree = jest.fn().mockReturnValue({ returning: deleteWhereThreeReturning });
    const tx = {
      delete: jest
        .fn()
        .mockReturnValueOnce({ where: deleteWhereOne })
        .mockReturnValueOnce({ where: deleteWhereTwo })
        .mockReturnValueOnce({ where: deleteWhereThree }),
    } as any;
    const db = {
      transaction: jest.fn().mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    } as any;
    const repository = new ExamRepository({ problemRepository: {} as any });
    (repository as any).db = db;

    const result = await repository.deleteExamWithRelations('exam-1');

    expect(tx.delete).toHaveBeenNthCalledWith(1, examToProblems);
    expect(tx.delete).toHaveBeenNthCalledWith(2, examParticipations);
    expect(tx.delete).toHaveBeenNthCalledWith(3, exam);
    expect(result).toBe(true);
  });

  it('creates a repository wired with a concrete problem repository', () => {
    const repository = createExamRepository();

    expect(repository).toBeInstanceOf(ExamRepository);
    expect((repository as any).problemRepository).toBeInstanceOf(ProblemRepository);
  });
});