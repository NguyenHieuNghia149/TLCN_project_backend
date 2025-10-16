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
import { and, desc, eq, gt, ilike, lt, or } from 'drizzle-orm';

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

  async createProblemTransactional(input: ProblemInput): Promise<ChallengeCreationResult> {
    const { testcases: testcaseInputs, solution, ...problemData } = input;

    return this.db.transaction(async tx => {
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
            .then(rows => {
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
                .then(rows => {
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
    });
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

    const baseWhere = eq(problems.topicId, topicId);

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

    const rows = await this.db
      .select()
      .from(problems)
      .where(whereClause ? and(baseWhere, whereClause) : baseWhere)
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

  async findByTopicWithTagsCursor(params: {
    topicId: string;
    tags: string[];
    limit: number;
    cursor?: { createdAt: Date; id: string } | null;
  }): Promise<{ items: ProblemEntity[]; nextCursor: { createdAt: Date; id: string } | null }> {
    const { topicId, tags, limit, cursor } = params;

    const baseWhere = eq(problems.topicId, topicId);

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

    const finalWhere = [baseWhere, tagWhere, cursorWhere].filter(Boolean) as any[];

    const rows = await this.db
      .select()
      .from(problems)
      .where(finalWhere.length === 1 ? finalWhere[0] : and(...finalWhere))
      .orderBy(desc(problems.createdAt), desc(problems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt as Date, id: last.id } : null;
    return { items, nextCursor };
  }
}
