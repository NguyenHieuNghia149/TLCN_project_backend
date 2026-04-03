import { SolutionApproachRepository } from '../../../apps/api/src/repositories/solutionApproach.repository';

describe('SolutionApproachRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('hydrates code variants from canonical child rows', async () => {
    const repository = new SolutionApproachRepository();
    const select = jest
      .fn()
      .mockImplementationOnce(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn().mockResolvedValue([
              {
                id: 'approach-1',
                solutionId: 'solution-1',
                title: 'Hash Map',
                description: 'shared explanation',
                timeComplexity: 'O(n)',
                spaceComplexity: 'O(n)',
                explanation: 'details',
                order: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            where: jest.fn(() => ({
              orderBy: jest.fn().mockResolvedValue([
                {
                  approachId: 'approach-1',
                  language: 'cpp',
                  sourceCode: 'canonical cpp',
                },
                {
                  approachId: 'approach-1',
                  language: 'java',
                  sourceCode: 'canonical java',
                },
              ]),
            })),
          })),
        })),
      }));
    (repository as any).db = { select };

    const result = await repository.findBySolutionId('solution-1');

    expect(result[0]?.codeVariants).toEqual([
      { language: 'cpp', sourceCode: 'canonical cpp' },
      { language: 'java', sourceCode: 'canonical java' },
    ]);
  });

  it('does not fall back to legacy jsonb when canonical child rows are absent', async () => {
    const repository = new SolutionApproachRepository();
    const select = jest
      .fn()
      .mockImplementationOnce(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn().mockResolvedValue([
              {
                id: 'approach-1',
                solutionId: 'solution-1',
                title: 'Hash Map',
                description: 'shared explanation',
                codeVariants: [{ language: 'cpp', sourceCode: 'legacy cpp' }],
                timeComplexity: 'O(n)',
                spaceComplexity: 'O(n)',
                explanation: 'details',
                order: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            where: jest.fn(() => ({
              orderBy: jest.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }));
    (repository as any).db = { select };

    const result = await repository.findBySolutionId('solution-1');

    expect(result[0]?.codeVariants).toEqual([]);
  });
});
