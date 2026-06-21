import { TestcaseRepository } from '@backend/api/repositories/testcase.repository';

describe('TestcaseRepository JSON-only persistence records', () => {
  it('drops cached input and output text when normalizing structured testcase data', () => {
    const repository = new TestcaseRepository();
    const testcase = {
      input: 'stale input cache',
      output: 'stale output cache',
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
      isPublic: true,
      point: 10,
    };

    const record = (repository as any).normalizeTestcaseRecord('problem-1', testcase);

    expect(record).toEqual({
      problemId: 'problem-1',
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
      isPublic: true,
      point: 10,
    });
    expect('input' in record).toBe(false);
    expect('output' in record).toBe(false);
  });
});