import { pgTable, uuid, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './user';
import { roadmapItems } from './roadmapItem';

/**
 * R14.2: User Item Completion Tracking Entity
 * 
 * Tracks per-user completion of roadmap items.
 * Enables sequential unlocking: user must complete item N-1 before item N becomes unlocked.
 * 
 * Schema:
 * - id: unique identifier for the completion record
 * - userId: who completed the item
 * - itemId: which roadmap item was completed
 * - completedAt: when the completion occurred
 * - createdAt: record creation timestamp
 * 
 * Constraints:
 * - Unique index on (userId, itemId): prevent duplicate completions
 * - Indices on userId and itemId for efficient queries
 */
export const userItemCompletions = pgTable(
  'user_item_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => roadmapItems.id, { onDelete: 'cascade' }),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    // Index for efficient user queries
    index('user_item_completions_user_id_idx').on(table.userId),
    // Index for efficient item queries
    index('user_item_completions_item_id_idx').on(table.itemId),
    // Unique constraint: one completion record per user per item
    unique('user_item_completions_unique_user_item').on(table.userId, table.itemId),
  ]
);

export type UserItemCompletionEntity = typeof userItemCompletions.$inferSelect;
export type UserItemCompletionInsert = typeof userItemCompletions.$inferInsert;
