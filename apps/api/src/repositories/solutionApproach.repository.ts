import { asc, eq, inArray } from 'drizzle-orm';

import {
  SolutionApproachEntity,
  solutionApproachCodeVariants,
  SolutionApproachInsert,
  solutionApproaches,
  languages,
} from '@backend/shared/db/schema';
import { CodeVariant } from '@backend/shared/types';

import { BaseRepository } from './base.repository';

export type SolutionApproachRecord = SolutionApproachEntity & { codeVariants: CodeVariant[] };

export class SolutionApproachRepository extends BaseRepository<
  typeof solutionApproaches,
  SolutionApproachEntity,
  SolutionApproachInsert
> {
  constructor() {
    super(solutionApproaches);
  }

  async findBySolutionId(solutionId: string): Promise<SolutionApproachRecord[]> {
    const approaches = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.solutionId, solutionId))
      .orderBy(asc(this.table.order), asc(this.table.createdAt));

    if (approaches.length === 0) {
      return [];
    }

    const variants = await this.db
      .select({
        approachId: solutionApproachCodeVariants.approachId,
        language: languages.key,
        sourceCode: solutionApproachCodeVariants.sourceCode,
      })
      .from(solutionApproachCodeVariants)
      .innerJoin(languages, eq(solutionApproachCodeVariants.languageId, languages.id))
      .where(inArray(solutionApproachCodeVariants.approachId, approaches.map(approach => approach.id)))
      .orderBy(asc(languages.sortOrder), asc(languages.key));

    const variantsByApproachId = new Map<string, CodeVariant[]>();
    for (const variant of variants) {
      if (!variantsByApproachId.has(variant.approachId)) {
        variantsByApproachId.set(variant.approachId, []);
      }

      variantsByApproachId.get(variant.approachId)!.push({
        language: variant.language,
        sourceCode: variant.sourceCode,
      });
    }

    return approaches.map(approach => ({
      ...approach,
      codeVariants: variantsByApproachId.get(approach.id) ?? [],
    }));
  }
}
