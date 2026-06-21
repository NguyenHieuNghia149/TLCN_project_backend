import dotenv from 'dotenv';
import { Client } from 'pg';

import { getIntegratedExecutableLanguageKeys, logger } from '@backend/shared/utils';

dotenv.config();

const APPLY_FLAG = '--apply';
const EXECUTABLE_LANGUAGE_KEYS = getIntegratedExecutableLanguageKeys();

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const legacyColumns = await client.query<{
      table_name: string;
      column_name: string;
    }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'solution_approaches' AND column_name = 'code_variants')
          OR (table_name = 'submissions' AND column_name = 'language')
        )
    `);

    const hasApproachLegacyColumn = legacyColumns.rows.some(
      row => row.table_name === 'solution_approaches' && row.column_name === 'code_variants',
    );
    const hasSubmissionLegacyColumn = legacyColumns.rows.some(
      row => row.table_name === 'submissions' && row.column_name === 'language',
    );

    if (!hasApproachLegacyColumn && !hasSubmissionLegacyColumn) {
      console.log(
        JSON.stringify(
          {
            mode: 'canonical-only',
            executableLanguageKeys: EXECUTABLE_LANGUAGE_KEYS,
            message: 'Legacy columns already removed; nothing to backfill.',
          },
          null,
          2,
        ),
      );
      return;
    }

    if (!hasApproachLegacyColumn || !hasSubmissionLegacyColumn) {
      throw new Error(
        'Legacy normalization backfill requires both solution_approaches.code_variants and submissions.language to exist.',
      );
    }

    const variantCandidates = await client.query<{
      approach_id: string;
      language_key: string;
      source_code: string;
    }>(
      `
        SELECT
          sa.id AS approach_id,
          l.key AS language_key,
          variant->>'sourceCode' AS source_code
        FROM solution_approaches sa
        CROSS JOIN LATERAL jsonb_array_elements(sa.code_variants) AS variant
        INNER JOIN languages l
          ON l.key = variant->>'language'
        LEFT JOIN solution_approach_code_variants sacv
          ON sacv.approach_id = sa.id
         AND sacv.language_id = l.id
        WHERE l.key = ANY($1::varchar[])
          AND sacv.id IS NULL
          AND COALESCE(variant->>'sourceCode', '') <> ''
      `,
      [EXECUTABLE_LANGUAGE_KEYS],
    );

    const unresolvedSubmissionRows = await client.query<{
      language: string;
      count: string;
    }>(
      `
        SELECT s.language, COUNT(*)::text AS count
        FROM submissions s
        LEFT JOIN languages l
          ON l.key = s.language
         AND l.key = ANY($1::varchar[])
        WHERE s.language_id IS NULL
          AND l.id IS NULL
        GROUP BY s.language
        ORDER BY COUNT(*) DESC, s.language ASC
      `,
      [EXECUTABLE_LANGUAGE_KEYS],
    );

    if (!process.argv.includes(APPLY_FLAG)) {
      const submissionCandidates = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM submissions s
          INNER JOIN languages l
            ON l.key = s.language
           AND l.key = ANY($1::varchar[])
          WHERE s.language_id IS NULL
        `,
        [EXECUTABLE_LANGUAGE_KEYS],
      );

      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            executableLanguageKeys: EXECUTABLE_LANGUAGE_KEYS,
            solutionApproachVariantRowsToInsert: variantCandidates.rowCount,
            submissionsToBackfill: Number(submissionCandidates.rows[0]?.count ?? '0'),
            unresolvedSubmissionLanguages: unresolvedSubmissionRows.rows.map(row => ({
              language: row.language,
              count: Number(row.count),
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query('BEGIN');

    const insertedVariants = await client.query(
      `
        INSERT INTO solution_approach_code_variants (
          approach_id,
          language_id,
          source_code
        )
        SELECT
          sa.id AS approach_id,
          l.id AS language_id,
          variant->>'sourceCode' AS source_code
        FROM solution_approaches sa
        CROSS JOIN LATERAL jsonb_array_elements(sa.code_variants) AS variant
        INNER JOIN languages l
          ON l.key = variant->>'language'
        LEFT JOIN solution_approach_code_variants sacv
          ON sacv.approach_id = sa.id
         AND sacv.language_id = l.id
        WHERE l.key = ANY($1::varchar[])
          AND sacv.id IS NULL
          AND COALESCE(variant->>'sourceCode', '') <> ''
        ON CONFLICT (approach_id, language_id) DO NOTHING
      `,
      [EXECUTABLE_LANGUAGE_KEYS],
    );

    const updatedSubmissions = await client.query(
      `
        UPDATE submissions s
        SET language_id = l.id
        FROM languages l
        WHERE s.language_id IS NULL
          AND l.key = s.language
          AND l.key = ANY($1::varchar[])
      `,
      [EXECUTABLE_LANGUAGE_KEYS],
    );

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          mode: 'apply',
          executableLanguageKeys: EXECUTABLE_LANGUAGE_KEYS,
          insertedSolutionApproachVariantRows: insertedVariants.rowCount ?? 0,
          updatedSubmissions: updatedSubmissions.rowCount ?? 0,
          unresolvedSubmissionLanguages: unresolvedSubmissionRows.rows.map(row => ({
            language: row.language,
            count: Number(row.count),
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
  logger.error('Language normalization backfill failed', { error });
  process.exitCode = 1;
});
