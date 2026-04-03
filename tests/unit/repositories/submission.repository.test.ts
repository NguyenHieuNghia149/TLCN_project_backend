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
});
