import { CreateTestcaseSchema, TestcaseResponseSchema } from '@backend/shared/validations/testcase.validation';

describe('Testcase validation JSON-first contract', () => {
  it('requires structured JSON fields on write', () => {
    expect(() =>
      CreateTestcaseSchema.parse({
        input: 'stale text',
        output: 'stale output',
      })
    ).toThrow();
  });

  it('requires structured JSON fields on read', () => {
    expect(() =>
      TestcaseResponseSchema.parse({
        id: 'case-1',
        input: 'nums: [1, 2, 3]',
        output: '[0,1]',
        isPublic: true,
        point: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    ).toThrow();
  });
});
