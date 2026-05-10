import { and, eq, inArray, max, desc } from 'drizzle-orm';
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

  /**
   * Get the maximum order value for items in a roadmap.
   * Used to calculate the next order when adding a new item.
   * Returns 0 if no items exist in the roadmap (next item will have order 1).
   * @param roadmapId The roadmap ID
   * @returns The maximum order value, or 0 if no items exist
   */
  async getMaxOrderByRoadmap(roadmapId: string): Promise<number> {
    const result = await this.db
      .select({ maxOrder: max(roadmapItems.order).as('maxOrder') })
      .from(roadmapItems)
      .where(eq(roadmapItems.roadmapId, roadmapId));

    return result[0]?.maxOrder ?? 0;
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

  /**
   * R13.3: Compact order values after item deletion
   * Ensures there are no gaps in order sequence (e.g., 1,2,3 instead of 1,3,5)
   * Useful for maintaining clean data after deletions
   * @param roadmapId The roadmap ID
   */
  async compactOrdersAfterDelete(roadmapId: string): Promise<void> {
    await this.db.transaction(async tx => {
      // Get all items in this roadmap ordered by current order
      const items = await tx
        .select({ id: roadmapItems.id, order: roadmapItems.order })
        .from(roadmapItems)
        .where(eq(roadmapItems.roadmapId, roadmapId))
        .orderBy(roadmapItems.order);

      // If there are gaps, reassign orders sequentially
      if (items.length > 0) {
        for (let newOrder = 1; newOrder <= items.length; newOrder += 1) {
          const currentOrder = items[newOrder - 1]!.order;
          if (currentOrder !== newOrder) {
            await tx
              .update(roadmapItems)
              .set({ order: newOrder, updatedAt: new Date() })
              .where(eq(roadmapItems.id, items[newOrder - 1]!.id));
          }
        }
      }
    });
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
