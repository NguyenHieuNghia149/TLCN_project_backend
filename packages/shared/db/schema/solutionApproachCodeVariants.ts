import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { languages } from './languages';
import { solutionApproaches } from './solutionApproaches';

export const solutionApproachCodeVariants = pgTable(
  'solution_approach_code_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    approachId: uuid('approach_id')
      .references(() => solutionApproaches.id, { onDelete: 'cascade' })
      .notNull(),
    languageId: uuid('language_id')
      .references(() => languages.id)
      .notNull(),
    sourceCode: text('source_code').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_solution_approach_code_variants_approach_id').on(table.approachId),
    index('idx_solution_approach_code_variants_language_id').on(table.languageId),
    unique('uq_solution_approach_code_variants_approach_language').on(
      table.approachId,
      table.languageId,
    ),
  ],
);

export type SolutionApproachCodeVariantEntity = typeof solutionApproachCodeVariants.$inferSelect;
export type SolutionApproachCodeVariantInsert = typeof solutionApproachCodeVariants.$inferInsert;

export const insertSolutionApproachCodeVariantSchema = createInsertSchema(
  solutionApproachCodeVariants,
  {
    approachId: z.string().uuid('Invalid approach ID'),
    languageId: z.string().uuid('Invalid language ID'),
    sourceCode: z.string().min(1, 'Solution code is required'),
  },
);

export const selectSolutionApproachCodeVariantSchema = createSelectSchema(
  solutionApproachCodeVariants,
);
