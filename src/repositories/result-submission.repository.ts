import { eq, and, desc, asc, count, sql } from 'drizzle-orm';
import { BaseRepository, PaginationOptions, PaginationResult } from './base.repository';
import {
  resultSubmissions,
  ResultSubmissionEntity,
  ResultSubmissionInsert,
} from '@/database/schema';

export class ResultSubmissionRepository extends BaseRepository<
  typeof resultSubmissions,
  ResultSubmissionEntity,
  ResultSubmissionInsert
> {
  constructor() {
    super(resultSubmissions);
  }

  async findBySubmissionId(submissionId: string): Promise<ResultSubmissionEntity[]> {
    const results = await this.db
      .select()
      .from(resultSubmissions)
      .where(eq(resultSubmissions.submissionId, submissionId))
      .orderBy(asc(resultSubmissions.testcaseId));

    return results;
  }

  async createBatch(results: ResultSubmissionInsert[]): Promise<ResultSubmissionEntity[]> {
    if (results.length === 0) {
      return [];
    }

    const insertedResults = await this.db.insert(resultSubmissions).values(results).returning();

    return insertedResults;
  }

  async updateBatch(
    submissionId: string,
    results: Partial<ResultSubmissionInsert>[]
  ): Promise<ResultSubmissionEntity[]> {
    if (results.length === 0) {
      return [];
    }

    const updatedResults: ResultSubmissionEntity[] = [];

    for (const result of results) {
      if (result.testcaseId) {
        const [updated] = await this.db
          .update(resultSubmissions)
          .set({
            ...result,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(resultSubmissions.submissionId, submissionId),
              eq(resultSubmissions.testcaseId, result.testcaseId)
            )
          )
          .returning();

        if (updated) {
          updatedResults.push(updated);
        }
      }
    }

    return updatedResults;
  }

  async deleteBySubmissionId(submissionId: string): Promise<boolean> {
    const result = await this.db
      .delete(resultSubmissions)
      .where(eq(resultSubmissions.submissionId, submissionId));

    return (result.rowCount || 0) > 0;
  }

  async getSubmissionSummary(submissionId: string): Promise<{
    total: number;
    passed: number;
    failed: number;
    averageExecutionTime: number;
    averageMemoryUse: number;
  }> {
    const results = await this.db
      .select()
      .from(resultSubmissions)
      .where(eq(resultSubmissions.submissionId, submissionId));

    const summary = {
      total: results.length,
      passed: 0,
      failed: 0,
      averageExecutionTime: 0,
      averageMemoryUse: 0,
    };

    if (results.length === 0) {
      return summary;
    }

    let totalExecutionTime = 0;
    let totalMemoryUse = 0;
    let validExecutionTimes = 0;
    let validMemoryUses = 0;

    results.forEach(result => {
      if (result.isPassed) {
        summary.passed++;
      } else {
        summary.failed++;
      }

      if (result.executionTime !== null && result.executionTime !== undefined) {
        totalExecutionTime += result.executionTime;
        validExecutionTimes++;
      }

      if (result.memoryUse !== null && result.memoryUse !== undefined) {
        totalMemoryUse += result.memoryUse;
        validMemoryUses++;
      }
    });

    summary.averageExecutionTime =
      validExecutionTimes > 0 ? totalExecutionTime / validExecutionTimes : 0;
    summary.averageMemoryUse = validMemoryUses > 0 ? totalMemoryUse / validMemoryUses : 0;

    return summary;
  }

  async getTestcaseResults(
    submissionId: string,
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<ResultSubmissionEntity>> {
    const { page = 1, limit = 10, sortBy = 'testcaseId', sortOrder = 'asc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query testcase results for specific submission
    const query = this.db
      .select()
      .from(resultSubmissions)
      .where(eq(resultSubmissions.submissionId, submissionId));

    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(
        sortOrder === 'asc' ? asc(resultSubmissions.testcaseId) : desc(resultSubmissions.testcaseId)
      );

    // Count total records
    const countQuery = await this.db
      .select({ total: count() })
      .from(resultSubmissions)
      .where(eq(resultSubmissions.submissionId, submissionId));

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

  async getProblemStats(problemId: string): Promise<{
    totalSubmissions: number;
    uniqueUsers: number;
    averageScore: number;
    successRate: number;
  }> {
    // This would require a join with submissions table
    // For now, returning basic stats
    const stats = await this.db
      .select({
        totalSubmissions: count(),
      })
      .from(resultSubmissions);

    return {
      totalSubmissions: stats[0]?.totalSubmissions || 0,
      uniqueUsers: 0, // Would need additional query
      averageScore: 0, // Would need additional calculation
      successRate: 0, // Would need additional calculation
    };
  }
}
