export type IntegratedExecutableLanguageKey = 'cpp' | 'java' | 'python';

export interface IntegratedExecutableLanguage {
  key: IntegratedExecutableLanguageKey;
  label: string;
  displayName: string;
  monacoLanguage: string;
  sortOrder: number;
}

export interface LanguageCatalogEntry {
  id: string;
  key: string;
  displayName: string;
  isActive: boolean;
  sortOrder: number;
}

export interface UpdateLanguageCatalogInput {
  displayName?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CodeVariant {
  language: string;
  sourceCode: string;
}

export type DynamicStarterCodeByLanguage = Record<string, string>;
