import '../utils/load-env';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, TransactionType } from '../db/connection';
import { resultSubmissions, submissions, testcases, users, roadmapItems, roadmapProgress } from '../db/schema';
import { ESubmissionStatus } from '../types';
import { SubmissionResult } from '../validations/submission.validation';

export type FinalizeSubmissionInput = {
  submissionId: string;
  status: ESubmissionStatus;
  result: SubmissionResult;
  judgedAt?: string;
};

export type FinalizeSubmissionResponse = { id: string; status: string } | null;

async function findSubmissionById(
  submissionId: string,
  executor: TransactionType
): Promise<typeof submissions.$inferSelect | null> {
  const [submission] = await executor
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  return submission || null;
}

async function hasUserSolvedProblem(
  userId: string,
  problemId: string,
  executor: TransactionType
): Promise<boolean> {
  const [result] = await executor
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

async function sumProblemTestcasePoints(
  problemId: string,
  executor: TransactionType
): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`SUM(${testcases.point})` })
    .from(testcases)
    .where(eq(testcases.problemId, problemId));

  return Number(row?.total ?? 0);
}

async function updateSubmissionStatusIdempotent(
  submissionId: string,
  status: ESubmissionStatus,
  judgedAt: Date,
  executor: TransactionType
): Promise<typeof submissions.$inferSelect | null> {
  const [submission] = await executor
    .update(submissions)
    .set({
      status,
      judgedAt,
    })
    .where(
      and(
        eq(submissions.id, submissionId),
        inArray(submissions.status, [ESubmissionStatus.PENDING, ESubmissionStatus.RUNNING])
      )
    )
    .returning();

  return submission || null;
}

async function incrementRankingPoint(
  userId: string,
  point: number,
  executor: TransactionType
): Promise<void> {
  if (point <= 0) {
    return;
  }

  await executor
    .update(users)
    .set({
      rankingPoint: sql`${users.rankingPoint} + ${point}`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

async function replaceResultSubmissions(
  submissionId: string,
  result: SubmissionResult,
  executor: TransactionType
): Promise<void> {
  await executor.delete(resultSubmissions).where(eq(resultSubmissions.submissionId, submissionId));

  if (result.results.length === 0) {
    return;
  }

  await executor.insert(resultSubmissions).values(
    result.results.map(item => ({
      submissionId,
      testcaseId: item.testcaseId,
      actualOutput: item.actualOutput,
      isPassed: item.isPassed,
      executionTime: item.executionTime,
      memoryUse: item.memoryUse,
      error: item.error,
    }))
  );
}

async function updateRoadmapProgressForProblem(
  userId: string,
  problemId: string,
  executor: TransactionType
): Promise<void> {
  const items = await executor
    .select({ id: roadmapItems.id, roadmapId: roadmapItems.roadmapId })
    .from(roadmapItems)
    .where(and(eq(roadmapItems.itemId, problemId), eq(roadmapItems.itemType, 'problem')));

  if (items.length === 0) return;

  const roadmapIds = items.map(i => i.roadmapId);
  const progresses = await executor
    .select()
    .from(roadmapProgress)
    .where(and(eq(roadmapProgress.userId, userId), inArray(roadmapProgress.roadmapId, roadmapIds)));

  for (const prog of progresses) {
    const rItem = items.find(i => i.roadmapId === prog.roadmapId);
    if (rItem) {
      const current = (prog.completedItemIds ?? []) as string[];
      if (!current.includes(rItem.id)) {
        const next = [...current, rItem.id];
        await executor
          .update(roadmapProgress)
          .set({ completedItemIds: next, updatedAt: new Date() })
          .where(eq(roadmapProgress.id, prog.id));
      }
    }
  }
}

export async function finalizeSubmissionResult(
  input: FinalizeSubmissionInput
): Promise<FinalizeSubmissionResponse> {
  return db.transaction(async tx => {
    const submissionBeforeUpdate = await findSubmissionById(input.submissionId, tx);
    if (!submissionBeforeUpdate) {
      return null;
    }

    let rankPointsToAdd = 0;

    if (
      input.status === ESubmissionStatus.ACCEPTED &&
      !submissionBeforeUpdate.examParticipationId
    ) {
      const rankLockKey = `submission-rank:${submissionBeforeUpdate.userId}:${submissionBeforeUpdate.problemId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${rankLockKey}))`);

      const hasSolvedBefore = await hasUserSolvedProblem(
        submissionBeforeUpdate.userId,
        submissionBeforeUpdate.problemId,
        tx
      );

      if (!hasSolvedBefore) {
        rankPointsToAdd = await sumProblemTestcasePoints(submissionBeforeUpdate.problemId, tx);
      }
    }

    const submission = await updateSubmissionStatusIdempotent(
      input.submissionId,
      input.status,
      input.judgedAt ? new Date(input.judgedAt) : new Date(),
      tx
    );

    if (!submission) {
      return null;
    }

    if (input.status === ESubmissionStatus.ACCEPTED && !submissionBeforeUpdate.examParticipationId) {
      await updateRoadmapProgressForProblem(
        submissionBeforeUpdate.userId,
        submissionBeforeUpdate.problemId,
        tx
      );
    }

    await incrementRankingPoint(submissionBeforeUpdate.userId, rankPointsToAdd, tx);
    await replaceResultSubmissions(input.submissionId, input.result, tx);

    return {
      id: submission.id,
      status: submission.status,
    };
  });
}
