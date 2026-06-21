import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const examProctoringEvaluationReports = pgTable(
  'exam_proctoring_evaluation_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelVersion: varchar('model_version', { length: 100 }).notNull(),
    featureSchemaVersion: varchar('feature_schema_version', { length: 50 }).notNull(),
    scoringSchemaVersion: varchar('scoring_schema_version', { length: 50 }).notNull(),
    labelSchemaVersion: varchar('label_schema_version', { length: 50 }).notNull(),
    datasetSnapshotRef: varchar('dataset_snapshot_ref', { length: 200 }).notNull(),
    sampleSize: integer('sample_size').default(0).notNull(),
    positiveLabelPolicyJson: jsonb('positive_label_policy_json')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    thresholdsJson: jsonb('thresholds_json').$type<Record<string, number>>().default({}).notNull(),
    metricsJson: jsonb('metrics_json').$type<Record<string, unknown>>().default({}).notNull(),
    confusionMatrixJson: jsonb('confusion_matrix_json')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    falsePositiveExamplesJson: jsonb('false_positive_examples_json')
      .$type<Array<Record<string, unknown>>>()
      .default([])
      .notNull(),
    falseNegativeExamplesJson: jsonb('false_negative_examples_json')
      .$type<Array<Record<string, unknown>>>()
      .default([])
      .notNull(),
    status: varchar('status', { length: 30 }).default('draft').notNull(),
    generatedBy: varchar('generated_by', { length: 100 }).notNull(),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('idx_exam_proctoring_evaluation_reports_model_generated').on(
      table.modelVersion,
      table.generatedAt
    ),
    index('idx_exam_proctoring_evaluation_reports_status_generated').on(
      table.status,
      table.generatedAt
    ),
  ]
);

export type ExamProctoringEvaluationReportEntity = typeof examProctoringEvaluationReports.$inferSelect;
export type ExamProctoringEvaluationReportInsert = typeof examProctoringEvaluationReports.$inferInsert;
