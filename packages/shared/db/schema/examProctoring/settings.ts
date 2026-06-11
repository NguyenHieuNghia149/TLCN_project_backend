import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { exam } from '../exam';

export const examProctoringSettings = pgTable(
  'exam_proctoring_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    enabled: boolean('enabled').default(false).notNull(),
    requireCamera: boolean('require_camera').default(true).notNull(),
    requireScreenShare: boolean('require_screen_share').default(true).notNull(),
    requireFullscreen: boolean('require_fullscreen').default(true).notNull(),
    requireMonitorDisplaySurface: boolean('require_monitor_display_surface')
      .default(true)
      .notNull(),
    precheckValiditySeconds: integer('precheck_validity_seconds').default(300).notNull(),
    heartbeatIntervalSeconds: integer('heartbeat_interval_seconds').default(10).notNull(),
    missedHeartbeatGraceMultiplier: integer('missed_heartbeat_grace_multiplier')
      .default(3)
      .notNull(),
    screenShareResumeTimeoutSeconds: integer('screen_share_resume_timeout_seconds')
      .default(30)
      .notNull(),
    fullscreenResumeTimeoutSeconds: integer('fullscreen_resume_timeout_seconds')
      .default(15)
      .notNull(),
    allowedEventTypesJson: jsonb('allowed_event_types_json')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    riskWeightsJson: jsonb('risk_weights_json')
      .$type<Record<string, number>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    riskThresholdsJson: jsonb('risk_thresholds_json')
      .$type<Record<string, number>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    clipboardPolicy: varchar('clipboard_policy', { length: 30 }).default('log_only').notNull(),
    aiAnomalyEnabled: boolean('ai_anomaly_enabled').default(true).notNull(),
    aiShadowMode: boolean('ai_shadow_mode').default(true).notNull(),
    aiJobWindowSeconds: integer('ai_job_window_seconds').default(300).notNull(),
    consentNoticeVersion: varchar('consent_notice_version', { length: 50 }).notNull(),
    legalLinksJson: jsonb('legal_links_json')
      .$type<Record<string, string>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    dataRetentionDays: integer('data_retention_days').default(180).notNull(),
    dataDeletionSlaDays: integer('data_deletion_sla_days').default(20).notNull(),
    sensitiveDataDeletionTargetHours: integer('sensitive_data_deletion_target_hours')
      .default(72)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [uniqueIndex('uq_exam_proctoring_settings_exam').on(table.examId)]
);

export type ExamProctoringSettingsEntity = typeof examProctoringSettings.$inferSelect;
export type ExamProctoringSettingsInsert = typeof examProctoringSettings.$inferInsert;
