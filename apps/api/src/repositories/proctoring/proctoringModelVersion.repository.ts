import { and, desc, eq } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  AiProctoringModelVersionEntity,
  AiProctoringModelVersionInsert,
  aiProctoringModelVersions,
} from '@backend/shared/db/schema';

export class ProctoringModelVersionRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: AiProctoringModelVersionInsert): Promise<AiProctoringModelVersionEntity> {
    const [created] = await this.database.insert(aiProctoringModelVersions).values(values).returning();
    return created;
  }

  async findByVersion(modelVersion: string): Promise<AiProctoringModelVersionEntity | null> {
    const [row] = await this.database
      .select()
      .from(aiProctoringModelVersions)
      .where(eq(aiProctoringModelVersions.modelVersion, modelVersion))
      .limit(1);
    return row ?? null;
  }

  async findDefaultActiveByType(modelType: string): Promise<AiProctoringModelVersionEntity | null> {
    const [row] = await this.database
      .select()
      .from(aiProctoringModelVersions)
      .where(
        and(
          eq(aiProctoringModelVersions.modelType, modelType),
          eq(aiProctoringModelVersions.status, 'active'),
          eq(aiProctoringModelVersions.isDefault, true)
        )
      )
      .orderBy(desc(aiProctoringModelVersions.activatedAt))
      .limit(1);
    return row ?? null;
  }

  async activateDefault(input: {
    modelVersion: string;
    modelType: string;
  }): Promise<AiProctoringModelVersionEntity> {
    const activate = async (database: any) => {
      await database
        .update(aiProctoringModelVersions)
        .set({ isDefault: false })
        .where(eq(aiProctoringModelVersions.modelType, input.modelType));

      const [row] = await database
        .update(aiProctoringModelVersions)
        .set({
          status: 'active',
          isDefault: true,
          activatedAt: new Date(),
          retiredAt: null,
        })
        .where(eq(aiProctoringModelVersions.modelVersion, input.modelVersion))
        .returning();

      return row;
    };

    const row = typeof this.database.transaction === 'function'
      ? await this.database.transaction(activate)
      : await activate(this.database);

    if (!row) {
      throw new Error(`Model version not found: ${input.modelVersion}`);
    }
    return row;
  }

  async retire(modelVersion: string): Promise<AiProctoringModelVersionEntity | null> {
    const [row] = await this.database
      .update(aiProctoringModelVersions)
      .set({
        status: 'retired',
        isDefault: false,
        retiredAt: new Date(),
      })
      .where(eq(aiProctoringModelVersions.modelVersion, modelVersion))
      .returning();
    return row ?? null;
  }
}
