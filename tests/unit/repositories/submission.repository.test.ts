import { SubmissionRepository } from '../../../apps/api/src/repositories/submission.repository';

describe('SubmissionRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('selects derived language keys from the languages table when loading a submission', async () => {
    const repository = new SubmissionRepository();
    const limit = jest.fn().mockResolvedValue([
      {
        id: 'submission-1',
        sourceCode: 'print(1)',
        status: 'PENDING',
        language: 'python',
        languageId: 'lang-python',
        submittedAt: new Date(),
        judgedAt: null,
        userId: 'user-1',
        problemId: 'problem-1',
        examParticipationId: null,
      },
    ]);
    const where = jest.fn(() => ({ limit }));
    const innerJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ innerJoin }));
    const select = jest.fn(() => ({ from }));
    (repository as any).db = { select };

    const result = await repository.findById('submission-1');

    expect(select).toHaveBeenCalledWith(expect.objectContaining({ language: expect.anything() }));
    expect(result?.language).toBe('python');
  });

  describe('findLatestByParticipationAndProblems', () => {
    it('returns an empty array without querying when problemIds is empty', async () => {
      const repository = new SubmissionRepository();
      const selectDistinctOn = jest.fn();
      (repository as any).db = { selectDistinctOn };

      const result = await repository.findLatestByParticipationAndProblems('participation-1', []);

      expect(result).toEqual([]);
      expect(selectDistinctOn).not.toHaveBeenCalled();
    });

    it('selects the latest submission per problem with language keys', async () => {
      const repository = new SubmissionRepository();
      const rows = [
        {
          id: 'submission-1',
          sourceCode: 'print(1)',
          status: 'ACCEPTED',
          language: 'python',
          languageId: 'lang-python',
          submittedAt: new Date('2026-05-28T01:00:00.000Z'),
          judgedAt: null,
          userId: 'user-1',
          problemId: 'problem-1',
          examParticipationId: 'participation-1',
        },
      ];
      const orderBy = jest.fn().mockResolvedValue(rows);
      const where = jest.fn(() => ({ orderBy }));
      const innerJoin = jest.fn(() => ({ where }));
      const from = jest.fn(() => ({ innerJoin }));
      const selectDistinctOn = jest.fn(() => ({ from }));
      (repository as any).db = { selectDistinctOn };

      const result = await repository.findLatestByParticipationAndProblems('participation-1', [
        'problem-1',
        'problem-2',
      ]);

      expect(selectDistinctOn).toHaveBeenCalledWith(
        [expect.anything()],
        expect.objectContaining({ language: expect.anything() }),
      );
      expect(from).toHaveBeenCalled();
      expect(innerJoin).toHaveBeenCalled();
      expect(where).toHaveBeenCalled();
      expect(orderBy).toHaveBeenCalled();
      expect(result).toBe(rows);
    });
  });

  describe('findLatestByUserProblemsBetween', () => {
    it('returns an empty array without querying when problemIds is empty', async () => {
      const repository = new SubmissionRepository();
      const selectDistinctOn = jest.fn();
      (repository as any).db = { selectDistinctOn };

      const result = await repository.findLatestByUserProblemsBetween(
        'user-1',
        [],
        new Date('2026-05-28T00:00:00.000Z'),
        new Date('2026-05-28T23:59:59.999Z'),
      );

      expect(result).toEqual([]);
      expect(selectDistinctOn).not.toHaveBeenCalled();
    });

    it('selects the latest user submission per problem in the time window with language keys', async () => {
      const repository = new SubmissionRepository();
      const rows = [
        {
          id: 'submission-1',
          sourceCode: 'print(1)',
          status: 'WRONG_ANSWER',
          language: 'python',
          languageId: 'lang-python',
          submittedAt: new Date('2026-05-28T01:00:00.000Z'),
          judgedAt: null,
          userId: 'user-1',
          problemId: 'problem-1',
          examParticipationId: null,
        },
      ];
      const orderBy = jest.fn().mockResolvedValue(rows);
      const where = jest.fn(() => ({ orderBy }));
      const innerJoin = jest.fn(() => ({ where }));
      const from = jest.fn(() => ({ innerJoin }));
      const selectDistinctOn = jest.fn(() => ({ from }));
      (repository as any).db = { selectDistinctOn };

      const result = await repository.findLatestByUserProblemsBetween(
        'user-1',
        ['problem-1', 'problem-2'],
        new Date('2026-05-28T00:00:00.000Z'),
        new Date('2026-05-28T23:59:59.999Z'),
      );

      expect(selectDistinctOn).toHaveBeenCalledWith(
        [expect.anything()],
        expect.objectContaining({ language: expect.anything() }),
      );
      expect(from).toHaveBeenCalled();
      expect(innerJoin).toHaveBeenCalled();
      expect(where).toHaveBeenCalled();
      expect(orderBy).toHaveBeenCalled();
      expect(result).toBe(rows);
    });
  });
});
