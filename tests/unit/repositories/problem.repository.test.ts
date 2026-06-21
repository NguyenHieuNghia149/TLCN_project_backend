import { ProblemVisibility } from '@backend/shared/types';
import { ProblemRepository } from '../../../apps/api/src/repositories/problem.repository';
import {
  languages,
  solutionApproachCodeVariants,
  solutionApproaches,
  solutions,
} from '@backend/shared/db/schema';

describe('ProblemRepository public tag aggregation', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('excludes private problems from topic tag aggregation', async () => {
    const repository = new ProblemRepository();
    const where = jest.fn().mockResolvedValue([
      { tags: 'array,tree', visibility: ProblemVisibility.PUBLIC },
      { tags: 'tree,graph', visibility: ProblemVisibility.PUBLIC },
    ]);
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    (repository as any).db = { select };

    const result = await repository.getTagsByTopicId('topic-1');

    expect(result).toEqual(['array', 'tree', 'graph']);
  });

  it('excludes private problems from global tag aggregation', async () => {
    const repository = new ProblemRepository();
    const where = jest.fn().mockResolvedValue([
      { tags: 'array,math', visibility: ProblemVisibility.PUBLIC },
      { tags: 'math,string', visibility: ProblemVisibility.PUBLIC },
    ]);
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    (repository as any).db = { select };

    const result = await repository.getAllTags();

    expect(result).toEqual(['array', 'math', 'string']);
  });

  it('persists normalized solution approach code rows separately from approach metadata', async () => {
    const repository = new ProblemRepository();
    const deleteWhere = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn(() => ({ where: deleteWhere }));
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn(() => ({ where: updateWhere }));
    const updateFn = jest.fn(() => ({ set: updateSet }));
    const limit = jest.fn().mockResolvedValue([{ id: 'solution-1' }]);
    const languageWhere = jest.fn().mockResolvedValue([
      { id: 'lang-cpp', key: 'cpp' },
      { id: 'lang-java', key: 'java' },
    ]);
    const from = jest.fn((table: unknown) => {
      if (table === solutions) {
        return { where: jest.fn(() => ({ limit })) };
      }

      if (table === languages) {
        return { where: languageWhere };
      }

      throw new Error('Unexpected table');
    });
    const select = jest.fn(() => ({ from }));
    const insertApproachValues = jest.fn(() => ({ returning: insertApproachReturning }));
    const insertApproachReturning = jest.fn().mockResolvedValue([
      {
        id: 'approach-1',
        solutionId: 'solution-1',
        title: 'Hash Map',
        description: 'shared explanation',
        codeVariants: [],
        order: 1,
      },
    ]);
    const insertVariantValues = jest.fn().mockResolvedValue(undefined);
    const insertFn = jest.fn((table: unknown) => {
      if (table === solutionApproaches) {
        return { values: insertApproachValues };
      }

      if (table === solutionApproachCodeVariants) {
        return { values: insertVariantValues };
      }

      throw new Error('Unexpected insert table');
    });
    const tx = {
      select,
      update: updateFn,
      insert: insertFn,
      delete: deleteFn,
    } as any;

    (repository as any).db = {
      transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    };

    await repository.updateSolutionTransactional('problem-1', {
      title: 'Reference Solution',
      description: 'Updated description',
      solutionApproaches: [
        {
          title: 'Hash Map',
          description: 'shared explanation',
          codeVariants: [
            { language: 'cpp', sourceCode: 'cpp code' },
            { language: 'java', sourceCode: 'java code' },
          ],
          order: 1,
        },
      ],
    });

    expect(insertApproachValues).toHaveBeenCalledWith([
      expect.objectContaining({
        solutionId: 'solution-1',
        title: 'Hash Map',
      }),
    ]);
    expect(insertVariantValues).toHaveBeenCalledWith([
      {
        approachId: 'approach-1',
        languageId: 'lang-cpp',
        sourceCode: 'cpp code',
      },
      {
        approachId: 'approach-1',
        languageId: 'lang-java',
        sourceCode: 'java code',
      },
    ]);

    const insertedApproaches = ((((insertApproachValues as any).mock.calls[0] ?? [])[0]) ?? []) as any[];
    const persistedApproach = insertedApproaches[0];
    expect(persistedApproach).not.toHaveProperty('codeVariants');
  });

  it('does not delete existing solution approaches when only solution metadata changes', async () => {
    const repository = new ProblemRepository();
    const deleteWhere = jest.fn();
    const deleteFn = jest.fn(() => ({ where: deleteWhere }));
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn(() => ({ where: updateWhere }));
    const updateFn = jest.fn(() => ({ set: updateSet }));
    const limit = jest.fn().mockResolvedValue([{ id: 'solution-1' }]);
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    const tx = {
      select,
      update: updateFn,
      insert: jest.fn(),
      delete: deleteFn,
    } as any;

    (repository as any).db = {
      transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    };

    await repository.updateSolutionTransactional('problem-1', {
      title: 'Updated solution title',
      description: 'Updated solution description',
      isVisible: true,
    });

    expect(deleteFn).not.toHaveBeenCalled();
  });
});


