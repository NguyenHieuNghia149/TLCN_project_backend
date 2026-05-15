import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { roadmaps } from './roadmap';
import { users } from './user';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const roadmapProgress = pgTable(
  'roadmap_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roadmapId: uuid('roadmap_id')
      .references(() => roadmaps.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    completedItemIds: jsonb('completed_item_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_roadmap_progress_user_roadmap').on(table.userId, table.roadmapId),
    unique('uq_roadmap_progress_user_roadmap').on(table.userId, table.roadmapId),
  ]
);

export type RoadmapProgressEntity = typeof roadmapProgress.$inferSelect;
export type RoadmapProgressInsert = typeof roadmapProgress.$inferInsert;

export const insertRoadmapProgressSchema = createInsertSchema(roadmapProgress, {
  completedItemIds: z.array(z.string().uuid()).default([]),
});
export const selectRoadmapProgressSchema = createSelectSchema(roadmapProgress);
