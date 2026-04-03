import { ValidationException } from '../exceptions/auth.exceptions';
import { NotFoundException } from '../exceptions/solution.exception';
import { SupportedLanguageRepository } from '../repositories/supportedLanguage.repository';

import {
  LanguageCatalogEntry,
  UpdateLanguageCatalogInput,
} from '@backend/shared/types';

export class SupportedLanguageService {
  private readonly supportedLanguageRepository: SupportedLanguageRepository;

  constructor(deps: { supportedLanguageRepository: SupportedLanguageRepository }) {
    this.supportedLanguageRepository = deps.supportedLanguageRepository;
  }

  async listActiveExecutableLanguages(): Promise<LanguageCatalogEntry[]> {
    const rows = await this.supportedLanguageRepository.findActiveExecutableLanguages();
    return rows.map(this.mapLanguageRow);
  }

  async listAllLanguages(): Promise<LanguageCatalogEntry[]> {
    const rows = await this.supportedLanguageRepository.findAllCatalogEntries();
    return rows.map(this.mapLanguageRow);
  }

  async updateLanguage(
    id: string,
    input: UpdateLanguageCatalogInput,
  ): Promise<LanguageCatalogEntry> {
    if (Object.values(input).every(value => value === undefined)) {
      throw new ValidationException('At least one language field must be updated.');
    }

    const updated = await this.supportedLanguageRepository.updateCatalogEntry(id, input);
    if (!updated) {
      throw new NotFoundException(`Language with ID ${id} not found.`);
    }

    return this.mapLanguageRow(updated);
  }

  private mapLanguageRow(row: any): LanguageCatalogEntry {
    return {
      id: row.id,
      key: row.key,
      displayName: row.displayName,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }
}

export function createSupportedLanguageService(): SupportedLanguageService {
  return new SupportedLanguageService({
    supportedLanguageRepository: new SupportedLanguageRepository(),
  });
}
