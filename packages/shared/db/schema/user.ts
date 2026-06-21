import { pgTable, uuid, varchar, timestamp, boolean, text, integer, index, foreignKey } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  avatar: text('avatar'),
  gender: varchar('gender', { length: 20 }),
  dateOfBirth: timestamp('date_of_birth'),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  role: varchar('role', { length: 20 }).default('user').notNull(),
  isShadowAccount: boolean('is_shadow_account').default(false).notNull(),
  rankingPoint: integer('ranking_point').default(0).notNull(),
  lastLoginAt: timestamp('last_login_at'),
  passwordChangedAt: timestamp('password_changed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Ban/Unban feature columns
  banReason: text('ban_reason'),
  bannedAt: timestamp('banned_at'),
  bannedByAdminId: uuid('banned_by_admin_id'),
}, (table) => [
  // Index 1: Speed up "list all banned users" query for admin dashboard
  index('idx_users_status_banned_at').on(table.status, table.bannedAt),
  // Index 2: Speed up "find users banned by specific admin" for audit trail
  index('idx_users_banned_by_admin_id').on(table.bannedByAdminId),
  // Foreign key constraint
  foreignKey({
    columns: [table.bannedByAdminId],
    foreignColumns: [table.id],
    name: 'fk_users_banned_by_admin_id',
  }).onDelete('set null'),
]);

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  role: z.enum(['user', 'owner', 'teacher']).default('user'),
  firstName: z.string().min(1, 'Firstname must be at least 1 characters'),
  lastName: z.string().min(1, 'Lastname must be at least 1 characters'),
  status: z.enum(['active', 'banned']).default('active'),
});

export const selectUserSchema = createSelectSchema(users);

export const updateUserSchema = insertUserSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  password: true, // Password updates should use separate endpoint
});

// Schema for password change
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

// Schema for password reset
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

// Type exports
export type UserEntity = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
