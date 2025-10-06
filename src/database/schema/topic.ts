import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const topic = pgTable('topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  topicName: varchar('topic_name', { length: 255 }).notNull(),
});

export type TopicEntity = typeof topic.$inferSelect;
export type TopicInsert = typeof topic.$inferInsert;

export const insertTopicSchema = createInsertSchema(topic, {
  topicName: z.string().min(1, 'Topic name is required'),
});

export const selectTopicSchema = createSelectSchema(topic);
