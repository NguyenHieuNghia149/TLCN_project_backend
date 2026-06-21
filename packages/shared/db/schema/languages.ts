import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const languages = pgTable('languages', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type LanguageEntity = typeof languages.$inferSelect;
export type LanguageInsert = typeof languages.$inferInsert;

export const insertLanguageSchema = createInsertSchema(languages, {
  key: z.string().min(1),
  displayName: z.string().min(1),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const selectLanguageSchema = createSelectSchema(languages);
