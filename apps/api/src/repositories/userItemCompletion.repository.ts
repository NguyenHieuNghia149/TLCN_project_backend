import { and, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import {
  userItemCompletions,
  UserItemCompletionEntity,
  UserItemCompletionInsert,
} from '@backend/shared/db/schema';

export class UserItemCompletionRepository extends BaseRepository<
  typeof userItemCompletions,
  UserItemCompletionEntity,
  UserItemCompletionInsert
> {
  constructor() {
    super(userItemCompletions);
  }

  /**
   * R14.2: Get user's completed items for a specific roadmap
   * Used to determine which items are unlocked (prerequisite checking)
   * @param userId The user ID
   * @param itemIds The roadmap item IDs to check
   * @returns Completed item IDs
   */
  async getCompletedItemsByUser(userId: string, itemIds: string[]): Promise<string[]> {
    if (itemIds.length === 0) return [];

    const completions = await this.db
      .select({ itemId: userItemCompletions.itemId })
      .from(userItemCompletions)
      .where(
        and(eq(userItemCompletions.userId, userId), inArray(userItemCompletions.itemId, itemIds))
      );

    return completions.map(c => c.itemId);
  }

  /**
   * Mark an item as completed by a user
   * @param userId The user ID
   * @param itemId The roadmap item ID
   * @returns The created completion record
   */
  async markItemCompleted(userId: string, itemId: string): Promise<UserItemCompletionEntity> {
    const [created] = await this.db
      .insert(userItemCompletions)
      .values({ userId, itemId })
      .returning();

    if (!created) {
      throw new Error('Failed to mark item as completed');
    }

    return created;
  }

  /**
   * Check if a user has completed a specific item
   * @param userId The user ID
   * @param itemId The roadmap item ID
   * @returns true if completed, false otherwise
   */
  async isItemCompletedByUser(userId: string, itemId: string): Promise<boolean> {
    const existing = await this.db
      .select({ id: userItemCompletions.id })
      .from(userItemCompletions)
      .where(
        and(eq(userItemCompletions.userId, userId), eq(userItemCompletions.itemId, itemId))
      )
      .limit(1);

    return existing.length > 0;
  }

  /**
   * Get all completed items for a user across all roadmaps (by item ID)
   * @param userId The user ID
   * @returns Array of completed item IDs
   */
  async getAllCompletedItemsByUser(userId: string): Promise<string[]> {
    const completions = await this.db
      .select({ itemId: userItemCompletions.itemId })
      .from(userItemCompletions)
      .where(eq(userItemCompletions.userId, userId));

    return completions.map(c => c.itemId);
  }
}

export function createUserItemCompletionRepository(): UserItemCompletionRepository {
  return new UserItemCompletionRepository();
}
