import { CommentRepository } from '@backend/api/repositories/comment.repository';

describe('CommentRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function createCommentListDbMock() {
    const rows = [
      {
        comment: { id: 'comment-1' },
        user: null,
      },
    ];
    const orderBy = jest.fn().mockResolvedValue(rows);
    const where = jest.fn(() => ({ orderBy }));
    const leftJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ leftJoin }));
    const select = jest.fn(() => ({ from }));

    return { db: { select }, orderBy };
  }

  function getRootListOrderClauses(orderBy: jest.Mock): Array<{
    column: string;
    direction: string;
  }> {
    const rootListOrderArgs = orderBy.mock.calls[0] ?? [];

    return rootListOrderArgs.map((arg: any) => ({
      column: arg.queryChunks?.[1]?.name,
      direction: String(arg.queryChunks?.[2]?.value?.[0] ?? '').trim(),
    }));
  }

  it('orders lesson comments with pinned comments first', async () => {
    const repository = new CommentRepository();
    const { db, orderBy } = createCommentListDbMock();
    (repository as any).db = db;

    await repository.listByLesson('lesson-1');

    expect(getRootListOrderClauses(orderBy)).toEqual([
      { column: 'is_pinned', direction: 'desc' },
      { column: 'pinned_at', direction: 'desc' },
      { column: 'created_at', direction: 'desc' },
    ]);
  });

  it('orders problem comments with pinned comments first', async () => {
    const repository = new CommentRepository();
    const { db, orderBy } = createCommentListDbMock();
    (repository as any).db = db;

    await repository.listByProblem('problem-1');

    expect(getRootListOrderClauses(orderBy)).toEqual([
      { column: 'is_pinned', direction: 'desc' },
      { column: 'pinned_at', direction: 'desc' },
      { column: 'created_at', direction: 'desc' },
    ]);
  });
});
