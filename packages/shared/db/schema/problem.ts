import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { lessons } from './lesson';
import { topics } from './topic';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { FunctionSignature, ProblemVisibility } from '@backend/shared/types';

export const problems = pgTable(
  'problems',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    difficult: varchar('difficult', { length: 20 }).notNull().default('easy'),
    constraint: text('constraint'),
    tags: text('tags'),
    timeLimit: integer('time_limit').default(1000),
    memoryLimit: varchar('memory_limit', { length: 20 }).default('128m'),
    lessonId: uuid('lesson_id').references(() => lessons.id),
    topicId: uuid('topic_id').references(() => topics.id),
    visibility: varchar('visibility', { length: 30 }).default(ProblemVisibility.PUBLIC).notNull(),
    functionSignature: jsonb('function_signature').$type<FunctionSignature>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_problems_topic_visibility_created_id').on(
      table.topicId,
      table.visibility,
      table.createdAt,
      table.id,
    ),
  ],
);

export type ProblemEntity = typeof problems.$inferSelect;
export type ProblemInsert = typeof problems.$inferInsert;

export const insertProblemSchema = createInsertSchema(problems, {
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  difficult: z.enum(['easy', 'medium', 'hard']).default('easy'),
  constraint: z.string().optional(),
  tags: z
    .array(z.string())
    .optional()
    .transform(arr => (arr ?? []).join(',')),
  lessonId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  visibility: z.string().default(ProblemVisibility.PUBLIC),
  functionSignature: z.custom<FunctionSignature>(),
});

export const selectProblemSchema = createSelectSchema(problems);
