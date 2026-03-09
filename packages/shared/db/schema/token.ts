import { pgTable, uuid, timestamp, text, varchar, boolean } from 'drizzle-orm/pg-core';
import { users } from './user';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// Refresh tokens table
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  token: text('token').notNull().unique(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  isRevoked: boolean('is_revoked').default(false).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
});

// Types
export type RefreshTokenEntity = typeof refreshTokens.$inferSelect;
export type RefreshTokenInsert = typeof refreshTokens.$inferInsert;

// Zod schemas
export const refreshTokenSchema = createInsertSchema(refreshTokens);
