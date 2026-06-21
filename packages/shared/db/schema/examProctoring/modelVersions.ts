import { boolean, index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from '../user';

export const aiProctoringModelVersions = pgTable(
  'ai_proctoring_model_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelKey: varchar('model_key', { length: 100 }).notNull(),
    modelVersion: varchar('model_version', { length: 100 }).notNull(),
    modelType: varchar('model_type', { length: 50 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    artifactUri: varchar('artifact_uri', { length: 500 }).notNull(),
    featureSchemaVersion: varchar('feature_schema_version', { length: 50 }).notNull(),
    scoringSchemaVersion: varchar('scoring_schema_version', { length: 50 }).notNull(),
    trainingDataSnapshotRef: varchar('training_data_snapshot_ref', { length: 200 }),
    trainingRows: integer('training_rows').default(0).notNull(),
    metricsJson: jsonb('metrics_json').$type<Record<string, unknown>>().default({}).notNull(),
    thresholdsJson: jsonb('thresholds_json').$type<Record<string, number>>().default({}).notNull(),
    status: varchar('status', { length: 30 }).default('draft').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    activatedAt: timestamp('activated_at'),
    retiredAt: timestamp('retired_at'),
  },
  table => [
    uniqueIndex('uq_ai_proctoring_model_versions_version').on(table.modelVersion),
    index('idx_ai_proctoring_model_versions_type_status').on(table.modelType, table.status),
    index('idx_ai_proctoring_model_versions_key_status').on(table.modelKey, table.status),
  ]
);

export type AiProctoringModelVersionEntity = typeof aiProctoringModelVersions.$inferSelect;
export type AiProctoringModelVersionInsert = typeof aiProctoringModelVersions.$inferInsert;
