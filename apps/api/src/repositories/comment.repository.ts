import {
  comments,
  CommentEntity,
  CommentInsert,
  lessons,
  problems,
  users,
} from '@backend/shared/db/schema';
import { BaseRepository } from './base.repository';
import { eq, desc, isNull, and, inArray } from 'drizzle-orm';

export type CommentWithUser = {
  comment: CommentEntity;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    role: string;
  } | null;
};

export type CommentWithReplies = CommentWithUser & {
  replies: CommentWithUser[];
};

export class CommentRepository extends BaseRepository<
  typeof comments,
  CommentEntity,
  CommentInsert
> {
  constructor() {
    super(comments);
  }

  async listByLesson(lessonId: string): Promise<CommentWithReplies[]> {
    const rows = await this.db
      .select({
        comment: this.table,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(this.table)
      .leftJoin(users, eq(this.table.userId, users.id))
      .where(and(eq(this.table.lessonId, lessonId), isNull(this.table.parentCommentId)))
      .orderBy(desc(this.table.createdAt));

    const repliesByParentId = await this.getRepliesByParentIds(rows.map(row => row.comment.id));

    return rows.map(row => ({
      ...row,
      replies: repliesByParentId.get(row.comment.id) || [],
    }));
  }

  async listByProblem(problemId: string): Promise<CommentWithReplies[]> {
    const rows = await this.db
      .select({
        comment: this.table,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(this.table)
      .leftJoin(users, eq(this.table.userId, users.id))
      .where(and(eq(this.table.problemId, problemId), isNull(this.table.parentCommentId)))
      .orderBy(desc(this.table.createdAt));

    const repliesByParentId = await this.getRepliesByParentIds(rows.map(row => row.comment.id));

    return rows.map(row => ({
      ...row,
      replies: repliesByParentId.get(row.comment.id) || [],
    }));
  }

  async getReplies(parentCommentId: string): Promise<CommentWithUser[]> {
    const replies = await this.db
      .select({
        comment: this.table,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(this.table)
      .leftJoin(users, eq(this.table.userId, users.id))
      .where(eq(this.table.parentCommentId, parentCommentId))
      .orderBy(this.table.createdAt);

    return replies as CommentWithUser[];
  }

  private async getRepliesByParentIds(
    parentCommentIds: string[]
  ): Promise<Map<string, CommentWithUser[]>> {
    if (parentCommentIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        comment: this.table,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(this.table)
      .leftJoin(users, eq(this.table.userId, users.id))
      .where(inArray(this.table.parentCommentId, parentCommentIds as any))
      .orderBy(this.table.createdAt);

    const repliesByParentId = new Map<string, CommentWithUser[]>();

    for (const row of rows as CommentWithUser[]) {
      const parentId = row.comment.parentCommentId;
      if (!parentId) {
        continue;
      }

      if (!repliesByParentId.has(parentId)) {
        repliesByParentId.set(parentId, []);
      }

      repliesByParentId.get(parentId)!.push(row);
    }

    return repliesByParentId;
  }

  async listByUser(userId: string): Promise<CommentWithUser[]> {
    const rows = await this.db
      .select({
        comment: this.table,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(this.table)
      .leftJoin(users, eq(this.table.userId, users.id))
      .where(eq(this.table.userId, userId))
      .orderBy(desc(this.table.createdAt));

    return rows as CommentWithUser[];
  }
}
