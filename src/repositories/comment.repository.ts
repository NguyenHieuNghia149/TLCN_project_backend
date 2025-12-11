import { comments, CommentEntity, CommentInsert, lessons, problems, users } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq, desc, isNull, and } from 'drizzle-orm';

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

export class CommentRepository extends BaseRepository<typeof comments, CommentEntity, CommentInsert> {
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
      .where(
        and(
          eq(this.table.lessonId, lessonId),
          isNull(this.table.parentCommentId) // Only get root comments
        )
      )
      .orderBy(desc(this.table.createdAt));

    // Fetch replies for each comment
    const result: CommentWithReplies[] = [];
    for (const row of rows) {
      const replies = await this.getReplies(row.comment.id);
      result.push({
        ...row,
        replies,
      });
    }

    return result;
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
      .where(
        and(
          eq(this.table.problemId, problemId),
          isNull(this.table.parentCommentId) // Only get root comments
        )
      )
      .orderBy(desc(this.table.createdAt));

    // Fetch replies for each comment
    const result: CommentWithReplies[] = [];
    for (const row of rows) {
      const replies = await this.getReplies(row.comment.id);
      result.push({
        ...row,
        replies,
      });
    }

    return result;
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
