import { comments, CommentEntity, CommentInsert, lessons, problems, users } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq, desc } from 'drizzle-orm';

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

export class CommentRepository extends BaseRepository<typeof comments, CommentEntity, CommentInsert> {
  constructor() {
    super(comments);
  }

  async listByLesson(lessonId: string): Promise<CommentWithUser[]> {
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
      .where(eq(this.table.lessonId, lessonId))
      .orderBy(desc(this.table.createdAt));

    return rows as CommentWithUser[];
  }

  async listByProblem(problemId: string): Promise<CommentWithUser[]> {
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
      .where(eq(this.table.problemId, problemId))
      .orderBy(desc(this.table.createdAt));

    return rows as CommentWithUser[];
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
