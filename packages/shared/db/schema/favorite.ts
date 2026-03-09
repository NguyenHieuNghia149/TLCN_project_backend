import { pgTable, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './user';
import { problems } from './problem';
import { lessons } from './lesson';

export const favorite = pgTable('favorite', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  problemId: uuid('problem_id').references(() => problems.id),
  lessonId: uuid('lesson_id').references(() => lessons.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type FavoriteEntity = typeof favorite.$inferSelect;
export type FavoriteInsert = typeof favorite.$inferInsert;
