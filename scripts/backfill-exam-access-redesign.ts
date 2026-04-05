import dotenv from 'dotenv';
import { Client } from 'pg';

import { logger } from '@backend/shared/utils';

dotenv.config();

const APPLY_FLAG = '--apply';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 240);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const apply = process.argv.includes(APPLY_FLAG);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const schemaPrerequisites = await client.query<{
      table_name: string;
      column_name: string;
    }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'exam' AND column_name IN ('slug', 'password_hash'))
          OR (table_name = 'exam_participations' AND column_name IN ('participant_id', 'attempt_number'))
          OR (table_name = 'users' AND column_name = 'is_shadow_account')
        )
    `);

    const hasExamSlug = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam' && row.column_name === 'slug',
    );
    const hasExamPasswordHash = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam' && row.column_name === 'password_hash',
    );
    const hasParticipationId = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam_participations' && row.column_name === 'participant_id',
    );
    const hasAttemptNumber = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam_participations' && row.column_name === 'attempt_number',
    );
    const hasShadowAccount = schemaPrerequisites.rows.some(
      row => row.table_name === 'users' && row.column_name === 'is_shadow_account',
    );

    if (!hasExamSlug || !hasExamPasswordHash || !hasParticipationId || !hasAttemptNumber || !hasShadowAccount) {
      console.log(
        JSON.stringify(
          {
            mode: apply ? 'apply' : 'dry-run',
            status: 'schema-missing',
            message:
              'Exam access redesign schema is not fully applied. Run DB migrations before backfill.',
          },
          null,
          2,
        ),
      );
      return;
    }

    const examsNeedingPasswordHash = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM exam
      WHERE self_registration_password_required = true
        AND password_hash IS NULL
    `);

    const examsNeedingSlug = await client.query<{
      id: string;
      title: string;
    }>(`
      SELECT id, title
      FROM exam
      WHERE slug IS NULL OR slug = ''
      ORDER BY created_at ASC, id ASC
    `);

    const existingSlugsResult = await client.query<{ slug: string }>(`
      SELECT slug
      FROM exam
      WHERE slug IS NOT NULL AND slug <> ''
    `);
    const existingSlugs = new Set(existingSlugsResult.rows.map(row => row.slug));

    const participantCandidates = await client.query<{
      exam_id: string;
      user_id: string;
      normalized_email: string;
      full_name: string;
    }>(`
      SELECT DISTINCT
        ep.exam_id,
        ep.user_id,
        LOWER(u.email) AS normalized_email,
        NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') AS full_name
      FROM exam_participations ep
      INNER JOIN users u
        ON u.id = ep.user_id
      LEFT JOIN exam_participants p
        ON p.exam_id = ep.exam_id
       AND p.user_id = ep.user_id
      WHERE ep.user_id IS NOT NULL
        AND p.id IS NULL
    `);

    const participationBackfillCount = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM exam_participations
      WHERE participant_id IS NULL
    `);

    const attemptNumberBackfillCount = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM exam_participations
      WHERE attempt_number IS NULL
    `);

    const dryRunPayload = {
      mode: apply ? 'apply' : 'dry-run',
      examsNeedingPasswordHash: Number(examsNeedingPasswordHash.rows[0]?.count ?? '0'),
      examsNeedingSlug: examsNeedingSlug.rowCount,
      participantsToCreate: participantCandidates.rowCount,
      participationsMissingParticipantId: Number(participationBackfillCount.rows[0]?.count ?? '0'),
      participationsMissingAttemptNumber: Number(attemptNumberBackfillCount.rows[0]?.count ?? '0'),
    };

    if (!apply) {
      console.log(JSON.stringify(dryRunPayload, null, 2));
      return;
    }

    await client.query('BEGIN');

    const hashedPasswords = 0;

    let slugUpdates = 0;
    for (const row of examsNeedingSlug.rows) {
      const baseSlug = slugify(row.title || 'exam');
      let candidate = baseSlug || 'exam';
      let suffix = 1;
      while (existingSlugs.has(candidate)) {
        candidate = `${baseSlug || 'exam'}-${suffix}`;
        suffix += 1;
      }

      await client.query(
        `
          UPDATE exam
          SET slug = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [row.id, candidate],
      );
      existingSlugs.add(candidate);
      slugUpdates += 1;
    }

    let insertedParticipants = 0;
    for (const row of participantCandidates.rows) {
      await client.query(
        `
          INSERT INTO exam_participants (
            exam_id,
            user_id,
            normalized_email,
            full_name,
            source,
            approval_status,
            access_status
          )
          VALUES ($1, $2, $3, $4, 'manual_add', 'approved', 'invited')
          ON CONFLICT (exam_id, normalized_email) DO NOTHING
        `,
        [row.exam_id, row.user_id, row.normalized_email, row.full_name || row.normalized_email],
      );
      insertedParticipants += 1;
    }

    const participationIdUpdate = await client.query(`
      UPDATE exam_participations ep
      SET participant_id = p.id
      FROM exam_participants p
      WHERE ep.participant_id IS NULL
        AND ep.exam_id = p.exam_id
        AND ep.user_id = p.user_id
    `);

    const attemptNumberUpdate = await client.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY participant_id
            ORDER BY started_at ASC, id ASC
          ) AS attempt_number
        FROM exam_participations
        WHERE participant_id IS NOT NULL
      )
      UPDATE exam_participations ep
      SET attempt_number = ranked.attempt_number
      FROM ranked
      WHERE ep.id = ranked.id
        AND (ep.attempt_number IS NULL OR ep.attempt_number <> ranked.attempt_number)
    `);

    const participantStatusUpdate = await client.query(`
      WITH latest AS (
        SELECT DISTINCT ON (ep.participant_id)
          ep.participant_id,
          ep.status,
          ep.submitted_at,
          ep.expires_at,
          ep.started_at,
          e.end_date,
          e.max_attempts,
          (
            SELECT COUNT(*)
            FROM exam_participations ep_count
            WHERE ep_count.participant_id = ep.participant_id
          ) AS attempts_used
        FROM exam_participations ep
        INNER JOIN exam e
          ON e.id = ep.exam_id
        WHERE ep.participant_id IS NOT NULL
        ORDER BY ep.participant_id, ep.started_at DESC, ep.id DESC
      )
      UPDATE exam_participants p
      SET access_status = CASE
        WHEN latest.status IN ('IN_PROGRESS', 'STARTED') THEN 'active'
        WHEN latest.submitted_at IS NOT NULL OR latest.status IN ('SUBMITTED', 'EXPIRED') THEN 'completed'
        WHEN latest.status = 'ABANDONED'
          THEN CASE
            WHEN NOW() <= latest.end_date AND latest.attempts_used < latest.max_attempts THEN 'eligible'
            ELSE 'completed'
          END
        ELSE COALESCE(p.access_status, 'invited')
      END,
      updated_at = NOW()
      FROM latest
      WHERE p.id = latest.participant_id
    `);

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          ...dryRunPayload,
          hashedPasswords,
          slugUpdates,
          insertedParticipants,
          updatedParticipationsWithParticipantId: participationIdUpdate.rowCount ?? 0,
          updatedAttemptNumbers: attemptNumberUpdate.rowCount ?? 0,
          updatedParticipantStatuses: participantStatusUpdate.rowCount ?? 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch(error => {
  logger.error('Exam access redesign backfill failed', { error });
  process.exitCode = 1;
});
