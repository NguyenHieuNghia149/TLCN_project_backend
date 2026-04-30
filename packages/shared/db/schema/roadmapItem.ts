import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { roadmaps } from './roadmap';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const roadmapItems = pgTable(
  'roadmap_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roadmapId: uuid('roadmap_id')
      .references(() => roadmaps.id, { onDelete: 'cascade' })
      .notNull(),
    itemType: varchar('item_type', { length: 20 }).notNull(),
    itemId: uuid('item_id').notNull(),
    order: integer('order').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_roadmap_items_roadmap_id').on(table.roadmapId),
    index('idx_roadmap_items_roadmap_order').on(table.roadmapId, table.order),
  ]
);

export type RoadmapItemEntity = typeof roadmapItems.$inferSelect;
export type RoadmapItemInsert = typeof roadmapItems.$inferInsert;

export const insertRoadmapItemSchema = createInsertSchema(roadmapItems, {
  itemType: z.enum(['lesson', 'problem']),
  itemId: z.string().uuid('Invalid itemId'),
  order: z.number().int().positive('Order must be positive'),
});
export const selectRoadmapItemSchema = createSelectSchema(roadmapItems);
