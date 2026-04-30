import { and, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import {
  roadmapItems,
  RoadmapItemEntity,
  RoadmapItemInsert,
} from '@backend/shared/db/schema';

export class RoadmapItemRepository extends BaseRepository<
  typeof roadmapItems,
  RoadmapItemEntity,
  RoadmapItemInsert
> {
  constructor() {
    super(roadmapItems);
  }

  async addItemToRoadmap(input: {
    roadmapId: string;
    itemType: 'lesson' | 'problem';
    itemId: string;
    order: number;
  }): Promise<RoadmapItemEntity> {
    const [created] = await this.db.insert(roadmapItems).values(input).returning();
    if (!created) {
      throw new Error('Failed to add item to roadmap');
    }
    return created;
  }

  async removeItemFromRoadmap(roadmapId: string, itemId: string): Promise<boolean> {
    const result = await this.db
      .delete(roadmapItems)
      .where(and(eq(roadmapItems.roadmapId, roadmapId), eq(roadmapItems.id, itemId)));
    return (result.rowCount ?? 0) > 0;
  }

  async listItemsByRoadmap(roadmapId: string): Promise<RoadmapItemEntity[]> {
    return this.db
      .select()
      .from(roadmapItems)
      .where(eq(roadmapItems.roadmapId, roadmapId))
      .orderBy(roadmapItems.order, roadmapItems.id);
  }

  async getItemsByRoadmapAndType(
    roadmapId: string,
    itemType: 'lesson' | 'problem'
  ): Promise<RoadmapItemEntity[]> {
    return this.db
      .select()
      .from(roadmapItems)
      .where(and(eq(roadmapItems.roadmapId, roadmapId), eq(roadmapItems.itemType, itemType)))
      .orderBy(roadmapItems.order, roadmapItems.id);
  }

  async reorderItems(roadmapId: string, itemIds: string[]): Promise<RoadmapItemEntity[]> {
    return this.db.transaction(async tx => {
      const existing = await tx
        .select({ id: roadmapItems.id })
        .from(roadmapItems)
        .where(eq(roadmapItems.roadmapId, roadmapId));

      const existingIds = existing.map(item => item.id);
      const dedup = new Set(itemIds);
      if (dedup.size !== itemIds.length) {
        throw new Error('Duplicate itemIds are not allowed');
      }
      if (existingIds.length !== itemIds.length) {
        throw new Error('itemIds must include all roadmap items');
      }
      const existingSet = new Set(existingIds);
      if (!itemIds.every(id => existingSet.has(id))) {
        throw new Error('itemIds contains invalid roadmap item');
      }

      for (let index = 0; index < itemIds.length; index += 1) {
        const itemId = itemIds[index]!;
        await tx
          .update(roadmapItems)
          .set({ order: index + 1, updatedAt: new Date() })
          .where(and(eq(roadmapItems.roadmapId, roadmapId), eq(roadmapItems.id, itemId)));
      }

      return tx
        .select()
        .from(roadmapItems)
        .where(and(eq(roadmapItems.roadmapId, roadmapId), inArray(roadmapItems.id, itemIds)))
        .orderBy(roadmapItems.order, roadmapItems.id);
    });
  }
}

export function createRoadmapItemRepository(): RoadmapItemRepository {
  return new RoadmapItemRepository();
}
