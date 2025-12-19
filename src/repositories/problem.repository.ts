import {
  ProblemEntity,
  ProblemInsert,
  problems,
  SolutionEntity,
  solutions,
  TestcaseEntity,
  testcases,
} from '@/database/schema';
import { BaseRepository } from './base.repository';
import { ProblemInput } from '@/validations/problem.validation';
import { SolutionApproachEntity, solutionApproaches } from '@/database/schema/solutionApproaches';
import { and, desc, eq, gt, ilike, lt, or, inArray, sql } from 'drizzle-orm';
import { ProblemVisibility } from '@/enums/problemVisibility.enum';
import { topics } from '@/database/schema';

export type ChallengeCreationResult = {
  problem: ProblemEntity;
  testcases: TestcaseEntity[];
  solution: (SolutionEntity & { solutionApproaches: SolutionApproachEntity[] }) | null;
};
export class ProblemRepository extends BaseRepository<
  typeof problems,
  ProblemEntity,
  ProblemInsert
> {
  constructor() {
    super(problems);
  }
  // Single implementation for problem creation (used by both wrappers below)
  private async _executeCreateProblem(
    tx: any,
    input: ProblemInput
  ): Promise<ChallengeCreationResult> {
    const { testcases: testcaseInputs, solution, ...problemData } = input;

    const problemRows = await tx
      .insert(problems)
      .values({
        title: problemData.title,
        description: problemData.description,
        difficult: problemData.difficulty ?? 'easy',
        constraint: problemData.constraint,
        tags: (problemData.tags ?? []).join(','),
        lessonId: problemData.lessonid,
        topicId: problemData.topicid,
        visibility: problemData.visibility ?? ProblemVisibility.PUBLIC,
      } as any)
      .returning();

    const createdProblem = problemRows[0];
    if (!createdProblem) throw new Error('Failed to create problem');

    const createdTestcases = await Promise.all(
      (testcaseInputs ?? []).map(tc =>
        tx
          .insert(testcases)
          .values({
            input: tc.input,
            output: tc.output,
            isPublic: tc.isPublic ?? false,
            point: tc.point ?? 0,
            problemId: createdProblem.id,
          } as any)
          .returning()
          .then((rows: any[]) => {
            const row = rows[0];
            if (!row) throw new Error('Failed to create testcase');
            return row;
          })
      )
    );

    let createdSolution: SolutionEntity | null = null;
    let createdApproaches: SolutionApproachEntity[] = [];

    if (solution) {
      const sRows = await tx
        .insert(solutions)
        .values({
          title: solution.title,
          description: solution.description,
          videoUrl: solution.videoUrl || null,
          imageUrl: solution.imageUrl || null,
          isVisible: solution.isVisible ?? true,
          problemId: createdProblem.id,
        } as any)
        .returning();

      const s = sRows[0];
      if (!s) throw new Error('Failed to create solution');
      createdSolution = s;

      if (solution.solutionApproaches && solution.solutionApproaches.length > 0) {
        createdApproaches = await Promise.all(
          solution.solutionApproaches.map(ap =>
            tx
              .insert(solutionApproaches)
              .values({
                solutionId: s.id,
                title: ap.title,
                description: ap.description,
                sourceCode: ap.sourceCode,
                language: ap.language,
                timeComplexity: ap.timeComplexity,
                spaceComplexity: ap.spaceComplexity,
                explanation: ap.explanation,
                order: ap.order,
              } as any)
              .returning()
              .then((rows: any[]) => {
                const row = rows[0];
                if (!row) throw new Error('Failed to create solution approach');
                return row;
              })
          )
        );
      }
    }

    return {
      problem: createdProblem,
      testcases: createdTestcases,
      solution: createdSolution
        ? ({ ...createdSolution, solutionApproaches: createdApproaches } as any)
        : null,
    };
  }

  getProblemsByTopicId(topicId: string): Promise<ProblemEntity[]> {
    return this.db.select().from(problems).where(eq(problems.topicId, topicId));
  }

  async findByTopicWithCursor(params: {
    topicId: string;
    limit: number;
    cursor?: { createdAt: Date; id: string } | null;
    direction?: 'forward' | 'backward';
  }): Promise<{ items: ProblemEntity[]; nextCursor: { createdAt: Date; id: string } | null }> {
    const { topicId, limit, cursor, direction = 'forward' } = params;

    const baseWhere = and(
      eq(problems.topicId, topicId),
      eq(problems.visibility, ProblemVisibility.PUBLIC)
    );

    const whereClause = cursor
      ? direction === 'forward'
        ? or(
            lt(problems.createdAt, cursor.createdAt),
            and(eq(problems.createdAt, cursor.createdAt), lt(problems.id, cursor.id))
          )
        : or(
            gt(problems.createdAt, cursor.createdAt),
            and(eq(problems.createdAt, cursor.createdAt), gt(problems.id, cursor.id))
          )
      : undefined;

    const finalWhere = whereClause ? and(baseWhere, whereClause) : baseWhere;

    const rows = await this.db
      .select()
      .from(problems)
      .where(finalWhere)
      .orderBy(desc(problems.createdAt), desc(problems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    const nextCursor = hasMore && last ? { createdAt: last.createdAt as Date, id: last.id } : null;

    return { items, nextCursor };
  }

  async getTagsByTopicId(topicId: string): Promise<string[]> {
    const rows = await this.db
      .select({ tags: problems.tags })
      .from(problems)
      .where(eq(problems.topicId, topicId));

    const tagSet = new Set<string>();
    for (const row of rows) {
      const csv = (row.tags as unknown as string) || '';
      csv
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet);
  }

  async getAllTags(): Promise<string[]> {
    const rows = await this.db.select({ tags: problems.tags }).from(problems);

    const tagSet = new Set<string>();
    for (const row of rows) {
      const csv = (row.tags as unknown as string) || '';
      csv
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet);
  }

  async findByTopicWithTagsCursor(params: {
    topicId: string;
    tags: string[];
    limit: number;
    cursor?: { createdAt: Date; id: string } | null;
  }): Promise<{ items: ProblemEntity[]; nextCursor: { createdAt: Date; id: string } | null }> {
    const { topicId, tags, limit, cursor } = params;

    const baseWhere = and(
      eq(problems.topicId, topicId),
      eq(problems.visibility, ProblemVisibility.PUBLIC)
    );

    // Build OR conditions for tags using ILIKE on CSV column
    const tagConds = tags.filter(Boolean).map(tag => ilike(problems.tags, `%${tag}%`));

    const tagWhere =
      tagConds.length > 0 ? (tagConds.length === 1 ? tagConds[0] : or(...tagConds)) : undefined;

    const cursorWhere = cursor
      ? or(
          lt(problems.createdAt, cursor.createdAt),
          and(eq(problems.createdAt, cursor.createdAt), lt(problems.id, cursor.id))
        )
      : undefined;

    const finalWhereConditions = [baseWhere, tagWhere, cursorWhere].filter(Boolean) as any[];

    const rows = await this.db
      .select()
      .from(problems)
      .where(
        finalWhereConditions.length === 1 ? finalWhereConditions[0] : and(...finalWhereConditions)
      )
      .orderBy(desc(problems.createdAt), desc(problems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt as Date, id: last.id } : null;
    return { items, nextCursor };
  }

  async findByIds(ids: string[]): Promise<ProblemEntity[]> {
    if (!ids || ids.length === 0) return [];
    return this.db.select().from(problems).where(inArray(problems.id, ids));
  }

  async findAllProblems(
    page: number = 1,
    limit: number = 10,
    search?: string,
    sortField: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];
    if (search) {
      conditions.push(ilike(problems.title, `%${search}%`));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Build order by
    let orderBy;
    const orderFunc = sortOrder === 'asc' ? (col: any) => col : desc;

    switch (sortField) {
      case 'title':
        orderBy = orderFunc(problems.title);
        break;
      case 'difficulty':
        orderBy = orderFunc(problems.difficult); // Note: column name is 'difficult'
        break;
      case 'visibility':
        orderBy = orderFunc(problems.visibility);
        break;
      case 'createdAt':
      default:
        orderBy = orderFunc(problems.createdAt);
        break;
    }

    const [totalResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(problems)
      .where(whereClause);
    const total = Number(totalResult?.count || 0);

    const data = await this.db
      .select({
        id: problems.id,
        title: problems.title,
        description: problems.description,
        difficult: problems.difficult,
        constraint: problems.constraint,
        tags: problems.tags,
        lessonId: problems.lessonId,
        topicId: problems.topicId,
        visibility: problems.visibility,
        createdAt: problems.createdAt,
        updatedAt: problems.updatedAt,
        topicName: topics.topicName,
      })
      .from(problems)
      .leftJoin(topics, eq(problems.topicId, topics.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return { data, total };
  }

  /**
   * Create a problem + testcases + solution using provided transaction client `tx`.
   * This allows callers to compose a larger transaction (e.g., creating exam + problems atomically).
   */
  /**
   * Public convenience API: create a problem. If `tx` is provided the operation
   * will reuse it; otherwise the repository opens a transaction.
   */
  async createProblemTransactional(
    input: ProblemInput,
    transaction?: any
  ): Promise<ChallengeCreationResult> {
    if (transaction) return this._executeCreateProblem(transaction, input);
    return this.db.transaction(async t => this._executeCreateProblem(t, input));
  }
  /**
   * Update solution and its approaches transactionally.
   * If solution doesn't exist, create it.
   */
  async updateSolutionTransactional(problemId: string, solutionData: any): Promise<void> {
    await this.db.transaction(async tx => {
      // 1. Check if solution exists
      const existingSolution = await tx
        .select()
        .from(solutions)
        .where(eq(solutions.problemId, problemId))
        .limit(1)
        .then((rows: any[]) => rows[0]);

      let solutionId: string;

      if (existingSolution) {
        // Update existing solution
        solutionId = existingSolution.id;
        await tx
          .update(solutions)
          .set({
            title: solutionData.title,
            description: solutionData.description,
            videoUrl: solutionData.videoUrl || null,
            imageUrl: solutionData.imageUrl || null,
            isVisible: solutionData.isVisible ?? true,
            updatedAt: new Date(),
          } as any)
          .where(eq(solutions.id, solutionId));
      } else {
        // Create new solution
        const newSolution = await tx
          .insert(solutions)
          .values({
            problemId,
            title: solutionData.title || 'Reference Solution',
            description: solutionData.description,
            videoUrl: solutionData.videoUrl || null,
            imageUrl: solutionData.imageUrl || null,
            isVisible: solutionData.isVisible ?? true,
          } as any)
          .returning()
          .then((rows: any[]) => rows[0]);

        if (!newSolution) throw new Error('Failed to create solution');
        solutionId = newSolution.id;
      }

      // 2. Handle approaches: Delete all existing and insert new ones
      await tx.delete(solutionApproaches).where(eq(solutionApproaches.solutionId, solutionId));

      if (solutionData.solutionApproaches && solutionData.solutionApproaches.length > 0) {
        await Promise.all(
          solutionData.solutionApproaches.map((ap: any) =>
            tx.insert(solutionApproaches).values({
              solutionId: solutionId,
              title: ap.title,
              description: ap.description,
              sourceCode: ap.sourceCode,
              language: ap.language,
              timeComplexity: ap.timeComplexity,
              spaceComplexity: ap.spaceComplexity,
              explanation: ap.explanation,
              order: ap.order,
            } as any)
          )
        );
      }
    });
  }

  // Method moved to TestcaseRepository
}
