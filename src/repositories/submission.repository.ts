import { eq, and, desc, asc, count, sql, inArray, getTableColumns, isNull } from 'drizzle-orm';
import { BaseRepository, PaginationOptions, PaginationResult } from './base.repository';
import { submissions, SubmissionEntity, SubmissionInsert, problems } from '@/database/schema';
import { ESubmissionStatus } from '@/enums/submissionStatus.enum';

export class SubmissionRepository extends BaseRepository<
  typeof submissions,
  SubmissionEntity,
  SubmissionInsert
> {
  constructor() {
    super(submissions);
  }

  async findLatestByParticipationAndProblem(
    participationId: string,
    problemId: string
  ): Promise<SubmissionEntity | null> {
    const [row] = await this.db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.examParticipationId, participationId),
          eq(submissions.problemId, problemId)
        )
      )
      .orderBy(desc(submissions.submittedAt))
      .limit(1);

    return row || null;
  }

  async findLatestByUserProblemBetween(
    userId: string,
    problemId: string,
    start: Date,
    end: Date
  ): Promise<SubmissionEntity | null> {
    const [row] = await this.db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.problemId, problemId),
          sql`${submissions.submittedAt} >= ${start}`,
          sql`${submissions.submittedAt} <= ${end}`
        )
      )
      .orderBy(desc(submissions.submittedAt))
      .limit(1);

    return row || null;
  }

  async findByUserId(
    userId: string,
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<SubmissionEntity>> {
    const { page = 1, limit = 10, sortBy = 'submittedAt', sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query submissions for specific user
    const query = this.db.select().from(submissions).where(eq(submissions.userId, userId));

    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    // Count total records
    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(eq(submissions.userId, userId));

    const total = countQuery[0]?.total || 0;
    const data = await dataQuery;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  async findByProblemId(
    problemId: string,
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<SubmissionEntity>> {
    const { page = 1, limit = 10, sortBy = 'submittedAt', sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query submissions for specific problem
    const query = this.db.select().from(submissions).where(eq(submissions.problemId, problemId));

    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    // Count total records
    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(eq(submissions.problemId, problemId));

    const total = countQuery[0]?.total || 0;
    const data = await dataQuery;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  async findByStatus(
    status: ESubmissionStatus,
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<SubmissionEntity>> {
    const { page = 1, limit = 10, sortBy = 'submittedAt', sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query submissions by status
    const query = this.db.select().from(submissions).where(eq(submissions.status, status));

    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    // Count total records
    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(eq(submissions.status, status));

    const total = countQuery[0]?.total || 0;
    const data = await dataQuery;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  async findByUserAndProblem(
    userId: string,
    problemId: string,
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<SubmissionEntity>> {
    const { page = 1, limit = 10, sortBy = 'submittedAt', sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query submissions for specific user and problem
    const query = this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.problemId, problemId)));

    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    // Count total records
    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.problemId, problemId)));

    const total = countQuery[0]?.total || 0;
    const data = await dataQuery;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  async findByParticipationAndProblem(
    participationId: string,
    problemId: string,
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<SubmissionEntity>> {
    const { page = 1, limit = 10, sortBy = 'submittedAt', sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query submissions for specific participation and problem
    const query = this.db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.examParticipationId, participationId),
          eq(submissions.problemId, problemId)
        )
      );

    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    // Count total records
    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(
        and(
          eq(submissions.examParticipationId, participationId),
          eq(submissions.problemId, problemId)
        )
      );

    const total = countQuery[0]?.total || 0;
    const data = await dataQuery;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  async updateStatus(
    id: string,
    status: ESubmissionStatus,
    judgedAt?: Date
  ): Promise<SubmissionEntity | null> {
    const [result] = await this.db
      .update(submissions)
      .set({
        status,
        judgedAt: judgedAt || new Date(),
      })
      .where(eq(submissions.id, id))
      .returning();

    return result || null;
  }

  async getSubmissionStats(
    userId?: string,
    problemId?: string
  ): Promise<{
    total: number;
    pending: number;
    running: number;
    accepted: number;
    wrongAnswer: number;
    timeLimitExceeded: number;
    memoryLimitExceeded: number;
    runtimeError: number;
    compilationError: number;
  }> {
    let whereCondition: any = sql`1=1`;

    if (userId) {
      whereCondition = and(whereCondition, eq(submissions.userId, userId));
    }

    if (problemId) {
      whereCondition = and(whereCondition, eq(submissions.problemId, problemId));
    }

    const stats = await this.db
      .select({
        status: submissions.status,
        count: count(),
      })
      .from(submissions)
      .where(whereCondition)
      .groupBy(submissions.status);

    const result = {
      total: 0,
      pending: 0,
      running: 0,
      accepted: 0,
      wrongAnswer: 0,
      timeLimitExceeded: 0,
      memoryLimitExceeded: 0,
      runtimeError: 0,
      compilationError: 0,
    };

    stats.forEach(stat => {
      result.total += stat.count;
      switch (stat.status) {
        case ESubmissionStatus.PENDING:
          result.pending = stat.count;
          break;
        case ESubmissionStatus.RUNNING:
          result.running = stat.count;
          break;
        case ESubmissionStatus.ACCEPTED:
          result.accepted = stat.count;
          break;
        case ESubmissionStatus.WRONG_ANSWER:
          result.wrongAnswer = stat.count;
          break;
        case ESubmissionStatus.TIME_LIMIT_EXCEEDED:
          result.timeLimitExceeded = stat.count;
          break;
        case ESubmissionStatus.MEMORY_LIMIT_EXCEEDED:
          result.memoryLimitExceeded = stat.count;
          break;
        case ESubmissionStatus.RUNTIME_ERROR:
          result.runtimeError = stat.count;
          break;
        case ESubmissionStatus.COMPILATION_ERROR:
          result.compilationError = stat.count;
          break;
      }
    });

    return result;
  }

  async getAcceptedProblemIdsByUser(userId: string, problemIds: string[]): Promise<Set<string>> {
    if (!problemIds.length) return new Set();

    const rows = await this.db
      .select({ problemId: submissions.problemId })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          inArray(submissions.problemId, problemIds),
          eq(submissions.status, ESubmissionStatus.ACCEPTED),
          isNull(submissions.examParticipationId)
        )
      )
      .groupBy(submissions.problemId);

    return new Set(rows.map(r => r.problemId));
  }

  async hasUserSolvedProblem(userId: string, problemId: string): Promise<boolean> {
    const [result] = await this.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.problemId, problemId),
          eq(submissions.status, ESubmissionStatus.ACCEPTED),
          isNull(submissions.examParticipationId)
        )
      )
      .limit(1);

    return !!result;
  }

  async findByUserAndStatus(
    userId: string,
    status: ESubmissionStatus,
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<SubmissionEntity & { problemTitle: string }>> {
    const { page = 1, limit = 10, sortBy = 'submittedAt', sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    const query = this.db
      .select({
        ...getTableColumns(submissions),
        problemTitle: problems.title,
      })
      .from(submissions)
      .leftJoin(problems, eq(submissions.problemId, problems.id))
      .where(and(eq(submissions.userId, userId), eq(submissions.status, status)));

    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.status, status)));

    const total = countQuery[0]?.total || 0;
    const data = await dataQuery;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // Cast data to match Expected Type (or update type definition if possible)
    // Here we return intersection type
    return {
      data: data as unknown as (SubmissionEntity & { problemTitle: string })[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }
}
