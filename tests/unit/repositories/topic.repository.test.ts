import { TopicRepository } from '@backend/api/repositories/topic.repository';

function createSubqueryProxy(selection: Record<string, any>) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        const field = selection[prop];
        if (!field) return undefined;

        if (prop !== 'topicId' && !field.fieldAlias) {
          throw new Error(
            `You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`,
          );
        }

        return field;
      },
    },
  );
}

function createDashboardDbMock() {
  const limit = jest.fn().mockResolvedValue([
    {
      name: 'Basics',
      lessons: '2',
      problems: '3',
    },
  ]);
  const finalQuery: { leftJoin: jest.Mock; limit: jest.Mock } = {} as any;
  finalQuery.leftJoin = jest.fn(() => finalQuery);
  finalQuery.limit = limit;
  const db = {
    select: jest.fn((selection: Record<string, any>) => {
      if ('totalLessons' in selection || 'totalProblems' in selection) {
        return {
          from: jest.fn(() => ({
            groupBy: jest.fn(() => ({
              as: jest.fn(() => createSubqueryProxy(selection)),
            })),
          })),
        };
      }

      return {
        from: jest.fn(() => finalQuery),
      };
    }),
  };

  return { db, limit };
}

describe('TopicRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('aliases aggregate subquery fields used by dashboard distribution', async () => {
    const repository = new TopicRepository();
    const { db, limit } = createDashboardDbMock();
    (repository as any).db = db;

    await expect(repository.getTopicDistribution(6)).resolves.toEqual([
      {
        name: 'Basics',
        lessons: 2,
        problems: 3,
      },
    ]);
    expect(limit).toHaveBeenCalledWith(6);
  });
});
