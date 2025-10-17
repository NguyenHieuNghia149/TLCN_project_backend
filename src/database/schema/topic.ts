import { index } from 'drizzle-orm/gel-core';
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const topics = pgTable('topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  topicName: varchar('topic_name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type TopicEntity = typeof topics.$inferSelect;
export type TopicInsert = typeof topics.$inferInsert;

export const insertTopicSchema = createInsertSchema(topics, {
  topicName: z.string().min(1, 'Topic name is required'),
});

export const selectTopicSchema = createSelectSchema(topics);
