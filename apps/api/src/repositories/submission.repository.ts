import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import { subDays, startOfDay } from 'date-fns';

import {
  languages,
  problems,
  SubmissionEntity,
  SubmissionInsert,
  submissions,
} from '@backend/shared/db/schema';
import { finalizeSubmissionResult as finalizeSubmissionResultInRuntime } from '@backend/shared/runtime/submission-finalization';
import { ESubmissionStatus } from '@backend/shared/types';
import { SubmissionResult } from '@backend/shared/validations/submission.validation';

import { BaseRepository, PaginationOptions, PaginationResult } from './base.repository';

export type SubmissionRecord = SubmissionEntity & { language: string };
export type SubmissionWithProblemTitleRecord = SubmissionRecord & { problemTitle: string | null };

export class SubmissionRepository extends BaseRepository<
  typeof submissions,
  SubmissionEntity,
  SubmissionInsert
> {
  constructor() {
    super(submissions);
  }

  private selectSubmissionRows(executor: any = this.db) {
    return executor
      .select({
        ...getTableColumns(submissions),
        language: languages.key,
      })
      .from(submissions)
      .innerJoin(languages, eq(submissions.languageId, languages.id));
  }

  private selectSubmissionRowsWithProblemTitle(executor: any = this.db) {
    return executor
      .select({
        ...getTableColumns(submissions),
        language: languages.key,
        problemTitle: problems.title,
      })
      .from(submissions)
      .innerJoin(languages, eq(submissions.languageId, languages.id))
      .leftJoin(problems, eq(submissions.problemId, problems.id));
  }

  private normalizePagination(paginationOptions: PaginationOptions = {}) {
    const { page = 1, limit = 10, sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    return {
      page,
      limit,
      sortOrder,
      offset: (page - 1) * limit,
    };
  }

  private buildPaginationResult<T>(
    page: number,
    limit: number,
    total: number,
    data: T[],
  ): PaginationResult<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  private async paginateSubmissionRows(
    whereCondition: any,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionRecord>> {
    const { page, limit, sortOrder, offset } = this.normalizePagination(paginationOptions);

    const data = await this.selectSubmissionRows()
      .where(whereCondition)
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(whereCondition);

    return this.buildPaginationResult(page, limit, countQuery[0]?.total || 0, data as SubmissionRecord[]);
  }

  private async paginateSubmissionRowsWithProblemTitle(
    whereCondition: any,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionWithProblemTitleRecord>> {
    const { page, limit, sortOrder, offset } = this.normalizePagination(paginationOptions);

    const data = await this.selectSubmissionRowsWithProblemTitle()
      .where(whereCondition)
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    const countQuery = await this.db
      .select({ total: count() })
      .from(submissions)
      .where(whereCondition);

    return this.buildPaginationResult(
      page,
      limit,
      countQuery[0]?.total || 0,
      data as SubmissionWithProblemTitleRecord[],
    );
  }

  override async findById(id: string, executor?: any): Promise<SubmissionRecord | null> {
    const [row] = await this.selectSubmissionRows(executor)
      .where(eq(submissions.id, id))
      .limit(1);

    return (row as SubmissionRecord) || null;
  }

  async findLatestByParticipationAndProblem(
    participationId: string,
    problemId: string,
  ): Promise<SubmissionRecord | null> {
    const [row] = await this.selectSubmissionRows()
      .where(
        and(
          eq(submissions.examParticipationId, participationId),
          eq(submissions.problemId, problemId),
        ),
      )
      .orderBy(desc(submissions.submittedAt))
      .limit(1);

    return (row as SubmissionRecord) || null;
  }

  async findLatestByUserProblemBetween(
    userId: string,
    problemId: string,
    start: Date,
    end: Date,
  ): Promise<SubmissionRecord | null> {
    const [row] = await this.selectSubmissionRows()
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.problemId, problemId),
          sql`${submissions.submittedAt} >= ${start}`,
          sql`${submissions.submittedAt} <= ${end}`,
        ),
      )
      .orderBy(desc(submissions.submittedAt))
      .limit(1);

    return (row as SubmissionRecord) || null;
  }

  override async findMany(
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionRecord>> {
    const { page, limit, sortOrder, offset } = this.normalizePagination(paginationOptions);

    const data = await this.selectSubmissionRows()
      .limit(limit)
      .offset(offset)
      .orderBy(sortOrder === 'asc' ? asc(submissions.submittedAt) : desc(submissions.submittedAt));

    const countQuery = await this.db.select({ total: count() }).from(submissions);

    return this.buildPaginationResult(page, limit, countQuery[0]?.total || 0, data as SubmissionRecord[]);
  }

  async findByUserId(
    userId: string,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionRecord>> {
    return this.paginateSubmissionRows(eq(submissions.userId, userId), paginationOptions);
  }

  async findByProblemId(
    problemId: string,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionRecord>> {
    return this.paginateSubmissionRows(eq(submissions.problemId, problemId), paginationOptions);
  }

  async findByStatus(
    status: ESubmissionStatus,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionRecord>> {
    return this.paginateSubmissionRows(eq(submissions.status, status), paginationOptions);
  }

  async findByUserAndProblem(
    userId: string,
    problemId: string,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionRecord>> {
    return this.paginateSubmissionRows(
      and(eq(submissions.userId, userId), eq(submissions.problemId, problemId)),
      paginationOptions,
    );
  }

  async findByParticipationAndProblem(
    participationId: string,
    problemId: string,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionRecord>> {
    return this.paginateSubmissionRows(
      and(
        eq(submissions.examParticipationId, participationId),
        eq(submissions.problemId, problemId),
      ),
      paginationOptions,
    );
  }

  async updateStatus(
    id: string,
    status: ESubmissionStatus,
    judgedAt?: Date,
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

  async updateStatusIdempotent(
    id: string,
    status: ESubmissionStatus,
    judgedAt?: Date,
    executor?: any,
  ): Promise<SubmissionEntity | null> {
    const [result] = await (executor ?? this.db)
      .update(submissions)
      .set({
        status,
        judgedAt: judgedAt || new Date(),
      })
      .where(
        and(
          eq(submissions.id, id),
          inArray(submissions.status, [ESubmissionStatus.PENDING, ESubmissionStatus.RUNNING]),
        ),
      )
      .returning();

    return result || null;
  }

  async getSubmissionStats(
    userId?: string,
    problemId?: string,
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

    stats.forEach((stat: any) => {
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
          isNull(submissions.examParticipationId),
        ),
      )
      .groupBy(submissions.problemId);

    return new Set(rows.map((r: any) => r.problemId));
  }

  async hasUserSolvedProblem(
    userId: string,
    problemId: string,
    executor?: any,
  ): Promise<boolean> {
    const [result] = await (executor ?? this.db)
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.problemId, problemId),
          eq(submissions.status, ESubmissionStatus.ACCEPTED),
          isNull(submissions.examParticipationId),
        ),
      )
      .limit(1);

    return !!result;
  }

  async finalizeSubmissionResult(input: {
    submissionId: string;
    status: ESubmissionStatus;
    result: SubmissionResult;
    judgedAt?: string;
  }): Promise<{ id: string; status: string } | null> {
    return finalizeSubmissionResultInRuntime(input);
  }

  async findByUserAndStatus(
    userId: string,
    status: ESubmissionStatus,
    paginationOptions: PaginationOptions = {},
  ): Promise<PaginationResult<SubmissionWithProblemTitleRecord>> {
    return this.paginateSubmissionRowsWithProblemTitle(
      and(eq(submissions.userId, userId), eq(submissions.status, status)),
      paginationOptions,
    );
  }

  async countTotal(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(submissions);
    return result[0]?.count || 0;
  }

  async getDailyTrend(days: number = 7): Promise<Array<{ date: string; count: number }>> {
    const startDate = subDays(startOfDay(new Date()), days - 1);

    const result = await this.db
      .select({
        date: sql<string>`DATE(${submissions.submittedAt})`,
        count: count(),
      })
      .from(submissions)
      .where(gte(submissions.submittedAt, startDate))
      .groupBy(sql`DATE(${submissions.submittedAt})`)
      .orderBy(asc(sql`DATE(${submissions.submittedAt})`));

    const dailyTrendMap = new Map(result.map((r: any) => [r.date, Number(r.count)]));
    const trend: Array<{ date: string; count: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = date.toISOString().split('T')[0] || '';
      trend.push({
        date: dateStr,
        count: dailyTrendMap.get(dateStr) || 0,
      });
    }

    return trend;
  }

  async getStatusDistribution(): Promise<{
    accepted: number;
    rejected: number;
    pending: number;
  }> {
    const submissionStatusResult = await this.db
      .select({
        status: submissions.status,
        count: count(),
      })
      .from(submissions)
      .groupBy(submissions.status);

    const submissionStatus = {
      accepted: 0,
      rejected: 0,
      pending: 0,
    };

    submissionStatusResult.forEach((item: { status: string; count: number }) => {
      if (item.status === ESubmissionStatus.ACCEPTED) submissionStatus.accepted = item.count;
      else if (
        item.status === ESubmissionStatus.WRONG_ANSWER ||
        item.status === ESubmissionStatus.RUNTIME_ERROR ||
        item.status === ESubmissionStatus.COMPILATION_ERROR ||
        item.status === ESubmissionStatus.TIME_LIMIT_EXCEEDED ||
        item.status === ESubmissionStatus.MEMORY_LIMIT_EXCEEDED
      )
        submissionStatus.rejected = item.count;
      else if (
        item.status === ESubmissionStatus.PENDING ||
        item.status === ESubmissionStatus.RUNNING
      )
        submissionStatus.pending = item.count;
    });

    return submissionStatus;
  }
}
