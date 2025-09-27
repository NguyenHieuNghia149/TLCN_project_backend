// Export all schemas
export * from './user';
export * from './token';

// Relations
import { relations } from 'drizzle-orm';
import { users } from './user';
import { refreshTokens } from './token';

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
