import { and, count, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import {
  roadmapItems,
  roadmapProgress,
  RoadmapProgressEntity,
  RoadmapProgressInsert,
} from '@backend/shared/db/schema';

export class RoadmapProgressRepository extends BaseRepository<
  typeof roadmapProgress,
  RoadmapProgressEntity,
  RoadmapProgressInsert
> {
  constructor() {
    super(roadmapProgress);
  }

  async getProgressByUserAndRoadmap(
    userId: string,
    roadmapId: string
  ): Promise<RoadmapProgressEntity | null> {
    const result = await this.db
      .select()
      .from(roadmapProgress)
      .where(and(eq(roadmapProgress.userId, userId), eq(roadmapProgress.roadmapId, roadmapId)))
      .limit(1);
    return result[0] ?? null;
  }

  async findByUserAndRoadmap(userId: string): Promise<RoadmapProgressEntity | null> {
    const result = await this.db
      .select()
      .from(roadmapProgress)
      .where(eq(roadmapProgress.userId, userId))
      .orderBy(roadmapProgress.updatedAt)
      .limit(1);
    return result[0] ?? null;
  }

  async updateProgress(
    userId: string,
    roadmapId: string,
    completedItemIds: string[]
  ): Promise<RoadmapProgressEntity> {
    const normalized = Array.from(new Set(completedItemIds));
    const existing = await this.getProgressByUserAndRoadmap(userId, roadmapId);

    if (existing) {
      const [updated] = await this.db
        .update(roadmapProgress)
        .set({
          completedItemIds: normalized,
          updatedAt: new Date(),
        })
        .where(eq(roadmapProgress.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error('Failed to update progress');
      }
      return updated;
    }

    const [created] = await this.db
      .insert(roadmapProgress)
      .values({ userId, roadmapId, completedItemIds: normalized })
      .returning();
    if (!created) {
      throw new Error('Failed to create progress');
    }
    return created;
  }

  async markItemCompleted(
    userId: string,
    roadmapId: string,
    itemId: string
  ): Promise<RoadmapProgressEntity> {
    const existing = await this.getProgressByUserAndRoadmap(userId, roadmapId);
    const current = existing?.completedItemIds ?? [];
    const next = Array.from(new Set([...(current as string[]), itemId]));
    return this.updateProgress(userId, roadmapId, next);
  }

  async markItemIncomplete(
    userId: string,
    roadmapId: string,
    itemId: string
  ): Promise<RoadmapProgressEntity> {
    const existing = await this.getProgressByUserAndRoadmap(userId, roadmapId);
    const current = (existing?.completedItemIds ?? []) as string[];
    const next = current.filter(id => id !== itemId);
    return this.updateProgress(userId, roadmapId, next);
  }

  async deleteProgressByRoadmap(roadmapId: string): Promise<void> {
    await this.db.delete(roadmapProgress).where(eq(roadmapProgress.roadmapId, roadmapId));
  }

  async getCompletionStats(
    userId: string,
    roadmapId: string
  ): Promise<{ total: number; completed: number; percentage: number; completedItems: string[] }> {
    const [totalItems] = await this.db
      .select({ total: count() })
      .from(roadmapItems)
      .where(eq(roadmapItems.roadmapId, roadmapId));

    const progress = await this.getProgressByUserAndRoadmap(userId, roadmapId);
    const completedItems = Array.from(new Set(((progress?.completedItemIds ?? []) as string[])));
    const completed = completedItems.length;
    const total = totalItems?.total ?? 0;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, percentage, completedItems };
  }

  async markItemCompletedInAllUserRoadmaps(
    userId: string,
    targetItemId: string,
    itemType: 'lesson' | 'problem'
  ): Promise<void> {
    // 1. Find all roadmapItems mapping to this lesson/problem
    const items = await this.db
      .select({ id: roadmapItems.id, roadmapId: roadmapItems.roadmapId })
      .from(roadmapItems)
      .where(and(eq(roadmapItems.itemId, targetItemId), eq(roadmapItems.itemType, itemType)));

    if (items.length === 0) return;

    // 2. Find all user progresses for these roadmaps
    const roadmapIds = items.map((i) => i.roadmapId);
    const progresses = await this.db
      .select()
      .from(roadmapProgress)
      .where(
        and(
          eq(roadmapProgress.userId, userId),
          inArray(roadmapProgress.roadmapId, roadmapIds)
        )
      );

    // 3. For each progress, add the corresponding roadmapItem.id to completedItemIds
    for (const prog of progresses) {
      const roadmapItem = items.find((i) => i.roadmapId === prog.roadmapId);
      if (roadmapItem) {
        const current = (prog.completedItemIds ?? []) as string[];
        if (!current.includes(roadmapItem.id)) {
          const next = [...current, roadmapItem.id];
          await this.updateProgress(userId, prog.roadmapId, next);
        }
      }
    }
  }

  async listProgressByUser(
    userId: string,
    limit: number,
    offset: number
  ): Promise<RoadmapProgressEntity[]> {
    return this.db
      .select()
      .from(roadmapProgress)
      .where(eq(roadmapProgress.userId, userId))
      .limit(limit)
      .offset(offset);
  }
}

export function createRoadmapProgressRepository(): RoadmapProgressRepository {
  return new RoadmapProgressRepository();
}
