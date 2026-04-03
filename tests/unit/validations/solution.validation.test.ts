import {
  CreateSolutionApproachSchema,
  SolutionApproachResponseSchema,
} from '@backend/shared/validations/solution.validation';

describe('solution validation multilingual code variants', () => {
  it('accepts the new codeVariants payload shape', () => {
    const parsed = CreateSolutionApproachSchema.parse({
      title: 'Brute Force',
      description: 'shared explanation',
      codeVariants: [
        { language: 'cpp', sourceCode: 'cpp code' },
        { language: 'java', sourceCode: 'java code' },
      ],
      order: 1,
    });

    expect(parsed.codeVariants).toHaveLength(2);
  });

  it('rejects the legacy single-language payload shape', () => {
    const parsed = CreateSolutionApproachSchema.safeParse({
      title: 'Hash Map',
      description: 'shared explanation',
      sourceCode: 'python code',
      language: 'python',
      order: 2,
    });

    expect(parsed.success).toBe(false);
  });

  it('uses codeVariants as the only solution code field in the response shape', () => {
    const parsed = SolutionApproachResponseSchema.parse({
      id: 'approach-1',
      title: 'Brute Force',
      description: 'shared explanation',
      codeVariants: [
        { language: 'cpp', sourceCode: 'cpp code' },
        { language: 'java', sourceCode: 'java code' },
      ],
      timeComplexity: 'O(n^2)',
      spaceComplexity: 'O(1)',
      explanation: 'details',
      order: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(parsed.codeVariants.map((variant: { language: string }) => variant.language)).toEqual([
      'cpp',
      'java',
    ]);
    expect(parsed).not.toHaveProperty('sourceCode');
    expect(parsed).not.toHaveProperty('language');
  });
});

