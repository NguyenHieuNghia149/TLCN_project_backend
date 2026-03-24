import { ProblemVisibility } from '@backend/shared/types';
import { ProblemRepository } from '../../../apps/api/src/repositories/problem.repository';

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
});
