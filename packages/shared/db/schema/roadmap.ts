import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const roadmaps = pgTable(
  'roadmaps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    visibility: varchar('visibility', { length: 20 }).notNull().default('public'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_roadmaps_created_by').on(table.createdBy),
    index('idx_roadmaps_visibility_created_at').on(table.visibility, table.createdAt),
  ]
);

export type RoadmapEntity = typeof roadmaps.$inferSelect;
export type RoadmapInsert = typeof roadmaps.$inferInsert;

export const insertRoadmapSchema = createInsertSchema(roadmaps, {
  title: z.string().min(1, 'Title is required'),
  visibility: z.enum(['public', 'private']).default('public'),
});
export const selectRoadmapSchema = createSelectSchema(roadmaps);
