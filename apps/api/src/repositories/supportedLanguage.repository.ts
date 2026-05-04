import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  LanguageEntity,
  LanguageInsert,
  languages,
} from '@backend/shared/db/schema';
import { getIntegratedExecutableLanguageKeys } from '@backend/shared/utils';
import { UpdateLanguageCatalogInput } from '@backend/shared/types';

import { BaseRepository } from './base.repository';

export class SupportedLanguageRepository extends BaseRepository<
  typeof languages,
  LanguageEntity,
  LanguageInsert
> {
  constructor() {
    super(languages);
  }

  async findActiveExecutableLanguages(): Promise<LanguageEntity[]> {
    return this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.isActive, true),
          inArray(this.table.key, getIntegratedExecutableLanguageKeys()),
        ),
      )
      .orderBy(asc(this.table.sortOrder), asc(this.table.key));
  }

  async findActiveExecutableLanguageByKey(key: string): Promise<LanguageEntity | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.isActive, true),
          eq(this.table.key, key),
          inArray(this.table.key, getIntegratedExecutableLanguageKeys()),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async findAllCatalogEntries(): Promise<LanguageEntity[]> {
    return this.db
      .select()
      .from(this.table)
      .where(inArray(this.table.key, getIntegratedExecutableLanguageKeys()))
      .orderBy(asc(this.table.sortOrder), asc(this.table.key));
  }

  async updateCatalogEntry(
    id: string,
    input: UpdateLanguageCatalogInput,
  ): Promise<LanguageEntity | null> {
    return this.update(id, input as Partial<LanguageInsert>);
  }
}
