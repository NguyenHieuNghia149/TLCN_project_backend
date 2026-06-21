import dotenv from 'dotenv';
import { Client } from 'pg';

import { logger } from '@backend/shared/utils';
import {
  invalidRegistrationWindowSelectSql,
  type InvalidRegistrationWindowRow,
} from './exam-access-redesign-data';

dotenv.config();

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

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
          (
            table_name = 'exam'
            AND column_name IN (
              'slug',
              'registration_password',
              'access_mode',
              'self_registration_approval_mode',
              'self_registration_password_required',
              'registration_open_at',
              'registration_close_at',
              'start_date',
              'status',
              'is_visible'
            )
          )
          OR (table_name = 'exam_participations' AND column_name = 'participant_id')
          OR (table_name = 'exam_participants' AND column_name IN ('normalized_email', 'user_id'))
        )
    `);

    const hasExamParticipants = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam_participants' && row.column_name === 'normalized_email',
    );
    const hasExamSlug = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam' && row.column_name === 'slug',
    );
    const hasExamRegistrationPassword = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam' && row.column_name === 'registration_password',
    );
    const hasExamRegistrationWindowColumns = [
      'registration_open_at',
      'registration_close_at',
      'start_date',
      'status',
      'is_visible',
      'self_registration_approval_mode',
      'self_registration_password_required',
      'access_mode',
    ].every(columnName =>
      schemaPrerequisites.rows.some(
        row => row.table_name === 'exam' && row.column_name === columnName,
      ),
    );
    const hasParticipationId = schemaPrerequisites.rows.some(
      row => row.table_name === 'exam_participations' && row.column_name === 'participant_id',
    );

    if (
      !hasExamParticipants ||
      !hasExamSlug ||
      !hasExamRegistrationPassword ||
      !hasExamRegistrationWindowColumns ||
      !hasParticipationId
    ) {
      console.log(
        JSON.stringify(
          {
            status: 'schema-missing',
            message:
              'Exam access redesign schema is not fully applied. Run DB migrations before audit.',
          },
          null,
          2,
        ),
      );
      return;
    }

    const [
      missingParticipantIds,
      duplicateEmails,
      duplicateUsers,
      invalidPolicies,
      missingSlugs,
      missingRegistrationPasswords,
      invalidRegistrationWindows,
    ] = await Promise.all([
      client.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM exam_participations
        WHERE participant_id IS NULL
      `),
      client.query<{
        exam_id: string;
        normalized_email: string;
        count: string;
      }>(`
        SELECT exam_id, normalized_email, COUNT(*)::text AS count
        FROM exam_participants
        GROUP BY exam_id, normalized_email
        HAVING COUNT(*) > 1
      `),
      client.query<{
        exam_id: string;
        user_id: string;
        count: string;
      }>(`
        SELECT exam_id, user_id, COUNT(*)::text AS count
        FROM exam_participants
        WHERE user_id IS NOT NULL
        GROUP BY exam_id, user_id
        HAVING COUNT(*) > 1
      `),
      client.query<{
        id: string;
        access_mode: string;
        self_registration_approval_mode: string | null;
        self_registration_password_required: boolean;
      }>(`
        SELECT id, access_mode, self_registration_approval_mode, self_registration_password_required
        FROM exam
        WHERE
          (access_mode = 'invite_only' AND self_registration_approval_mode IS NOT NULL)
          OR (access_mode = 'invite_only' AND self_registration_password_required = true)
      `),
      client.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM exam
        WHERE slug IS NULL OR slug = ''
      `),
      client.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM exam
        WHERE self_registration_password_required = true
          AND registration_password IS NULL
      `),
      client.query<InvalidRegistrationWindowRow>(invalidRegistrationWindowSelectSql),
    ]);

    console.log(
      JSON.stringify(
        {
          participationsMissingParticipantId: Number(
            missingParticipantIds.rows[0]?.count ?? '0',
          ),
          duplicateParticipantsByEmail: duplicateEmails.rows.map(row => ({
            examId: row.exam_id,
            normalizedEmail: row.normalized_email,
            count: Number(row.count),
          })),
          duplicateParticipantsByUserId: duplicateUsers.rows.map(row => ({
            examId: row.exam_id,
            userId: row.user_id,
            count: Number(row.count),
          })),
          invalidExamPolicies: invalidPolicies.rows,
          examsMissingSlug: Number(missingSlugs.rows[0]?.count ?? '0'),
          examsMissingRegistrationPassword: Number(
            missingRegistrationPasswords.rows[0]?.count ?? '0',
          ),
          invalidRegistrationWindows: invalidRegistrationWindows.rows.map(row => ({
            examId: row.id,
            title: row.title,
            status: row.status,
            isVisible: row.is_visible,
            accessMode: row.access_mode,
            selfRegistrationApprovalMode: row.self_registration_approval_mode,
            registrationOpenAt: row.registration_open_at,
            registrationCloseAt: row.registration_close_at,
            startDate: row.start_date,
            reason: row.reason,
          })),
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
  logger.error('Exam access redesign audit failed', { error });
  process.exitCode = 1;
});
