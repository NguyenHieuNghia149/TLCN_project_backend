import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ProctoringAiJobEntity,
  ProctoringAiJobInsert,
  proctoringAiJobs,
} from '@backend/shared/db/schema';

export class ProctoringAiJobRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ProctoringAiJobInsert): Promise<ProctoringAiJobEntity> {
    const [created] = await this.database.insert(proctoringAiJobs).values(values).returning();
    return created;
  }

  async findById(id: string): Promise<ProctoringAiJobEntity | null> {
    const [row] = await this.database
      .select()
      .from(proctoringAiJobs)
      .where(eq(proctoringAiJobs.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ProctoringAiJobEntity[]> {
    return this.database
      .select()
      .from(proctoringAiJobs)
      .where(eq(proctoringAiJobs.participationId, participationId))
      .orderBy(desc(proctoringAiJobs.createdAt));
  }

  async claimNext(input: {
    workerId: string;
    now?: Date;
    statuses?: string[];
  }): Promise<ProctoringAiJobEntity | null> {
    const now = input.now ?? new Date();
    const statuses = input.statuses ?? ['pending', 'retry'];
    const [candidate] = await this.database
      .select()
      .from(proctoringAiJobs)
      .where(and(inArray(proctoringAiJobs.status, statuses), lte(proctoringAiJobs.nextRunAt, now)))
      .orderBy(desc(proctoringAiJobs.priority), asc(proctoringAiJobs.nextRunAt))
      .limit(1);

    if (!candidate) {
      return null;
    }

    const [claimed] = await this.database
      .update(proctoringAiJobs)
      .set({
        status: 'running',
        lockedBy: input.workerId,
        lockedAt: now,
        attempts: (candidate.attempts ?? 0) + 1,
        updatedAt: now,
      })
      .where(and(eq(proctoringAiJobs.id, candidate.id), inArray(proctoringAiJobs.status, statuses)))
      .returning();

    return claimed ?? null;
  }

  async updateStatus(
    id: string,
    patch: Partial<ProctoringAiJobInsert>,
  ): Promise<ProctoringAiJobEntity | null> {
    const [row] = await this.database
      .update(proctoringAiJobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(proctoringAiJobs.id, id))
      .returning();
    return row ?? null;
  }
}
