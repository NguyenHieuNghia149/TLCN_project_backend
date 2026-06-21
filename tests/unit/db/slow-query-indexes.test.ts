import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dbRoot = path.resolve(__dirname, '../../../packages/shared/db');

function readSchema(filename: string): string {
  return readFileSync(path.join(dbRoot, 'schema', filename), 'utf8');
}

function readOptimizationMigration(): string {
  const migrationsDir = path.join(dbRoot, 'migrations');
  const filename = readdirSync(migrationsDir).find(name =>
    name.endsWith('_optimize_slow_query_indexes.sql')
  );

  expect(filename).toBeDefined();
  return readFileSync(path.join(migrationsDir, filename as string), 'utf8');
}

describe('slow-query performance indexes', () => {
  it('declares the targeted index definitions in the Drizzle schemas', () => {
    expect(readSchema('examParticipations.ts')).toContain(
      "index('idx_exam_participations_exam_status').on(table.examId, table.status)"
    );
    expect(readSchema('exam.ts')).toMatch(
      /index\('idx_exam_visible_status_created_at'\)\.on\(\s*table\.isVisible,\s*table\.status,\s*table\.createdAt\.desc\(\)\s*\)/
    );
    expect(readSchema('notification.ts')).toContain(
      "index('idx_notifications_user_created_at').on(table.userId, table.createdAt.desc())"
    );

    const submissionsSchema = readSchema('submission.ts');
    expect(submissionsSchema).toContain(
      ".where(sql`${table.status} = 'accepted' AND ${table.examParticipationId} IS NULL`)"
    );
    expect(submissionsSchema).not.toContain(
      ".where(sql`${table.status} = 'ACCEPTED' AND ${table.examParticipationId} IS NULL`)"
    );
  });

  it('migrates the targeted indexes and rebuilds the accepted-submission lookup', () => {
    const migration = readOptimizationMigration();

    expect(migration).toContain('idx_exam_participations_exam_status');
    expect(migration).toContain('idx_exam_visible_status_created_at');
    expect(migration).toContain('idx_notifications_user_created_at');
    expect(migration).toContain('DROP INDEX IF EXISTS "idx_submissions_accepted_solved_lookup"');
    expect(migration).toContain("'accepted'");
  });

  it('registers the optimization migration in the Drizzle journal', () => {
    const journal = readFileSync(path.join(dbRoot, 'migrations', 'meta', '_journal.json'), 'utf8');

    expect(journal).toContain('20260527120000_optimize_slow_query_indexes');
  });
});
