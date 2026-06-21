import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { DatabaseService, db } from '@backend/shared/db/connection';
import {
  languages,
  problems,
  solutionApproachCodeVariants,
  solutionApproaches,
  solutions,
  submissions,
} from '@backend/shared/db/schema';
import { logger, getIntegratedExecutableLanguageKeys } from '@backend/shared/utils';

type MissingApproachReport = {
  approachId: string;
  missingLanguages: string[];
};

type MissingChallengeReport = {
  challengeId: string;
  title: string;
  approaches: MissingApproachReport[];
};

async function main(): Promise<void> {
  await DatabaseService.connect();

  const activeLanguageRows = await db
    .select({ key: languages.key })
    .from(languages)
    .where(
      and(
        eq(languages.isActive, true),
        inArray(languages.key, getIntegratedExecutableLanguageKeys()),
      ),
    )
    .orderBy(asc(languages.sortOrder), asc(languages.key));
  const activeLangs = activeLanguageRows.map(row => row.key);

  const approachRows = await db
    .select({
      challengeId: problems.id,
      title: problems.title,
      approachId: solutionApproaches.id,
      variantLanguage: languages.key,
      variantSourceCode: solutionApproachCodeVariants.sourceCode,
    })
    .from(problems)
    .innerJoin(solutions, eq(solutions.problemId, problems.id))
    .innerJoin(solutionApproaches, eq(solutionApproaches.solutionId, solutions.id))
    .leftJoin(
      solutionApproachCodeVariants,
      eq(solutionApproachCodeVariants.approachId, solutionApproaches.id),
    )
    .leftJoin(languages, eq(solutionApproachCodeVariants.languageId, languages.id))
    .orderBy(asc(problems.createdAt), asc(solutionApproaches.order), asc(languages.sortOrder));

  const groupedApproaches = new Map<
    string,
    {
      challengeId: string;
      title: string;
      approachId: string;
      canonicalCodeVariants: Array<{ language: string; sourceCode: string }>;
    }
  >();

  for (const row of approachRows) {
    if (!groupedApproaches.has(row.approachId)) {
      groupedApproaches.set(row.approachId, {
        challengeId: row.challengeId,
        title: row.title ?? '',
        approachId: row.approachId,
        canonicalCodeVariants: [],
      });
    }

    if (row.variantLanguage && row.variantSourceCode) {
      groupedApproaches.get(row.approachId)!.canonicalCodeVariants.push({
        language: row.variantLanguage,
        sourceCode: row.variantSourceCode,
      });
    }
  }

  const challenges = new Map<string, MissingChallengeReport>();
  const checkedChallengeIds = new Set<string>();

  for (const approach of groupedApproaches.values()) {
    checkedChallengeIds.add(approach.challengeId);

    const missingLanguages = activeLangs.filter(
      language => !approach.canonicalCodeVariants.some(variant => variant.language === language),
    );

    if (missingLanguages.length === 0) {
      continue;
    }

    if (!challenges.has(approach.challengeId)) {
      challenges.set(approach.challengeId, {
        challengeId: approach.challengeId,
        title: approach.title,
        approaches: [],
      });
    }

    challenges.get(approach.challengeId)!.approaches.push({
      approachId: approach.approachId,
      missingLanguages,
    });
  }

  const submissionsMissingLanguageId = await db
    .select({ submissionId: submissions.id })
    .from(submissions)
    .where(isNull(submissions.languageId))
    .orderBy(asc(submissions.submittedAt), asc(submissions.id));

  const challengesMissingVariants = Array.from(challenges.values());
  const incomplete = challengesMissingVariants.length;
  const total = checkedChallengeIds.size;

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        activeLangs,
        challengesMissingVariants,
        submissionsMissingLanguageId: submissionsMissingLanguageId.map(row => row.submissionId),
        summary: {
          total,
          complete: total - incomplete,
          incomplete,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch(error => {
    logger.error('Missing-language report failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await DatabaseService.disconnect();
  });
