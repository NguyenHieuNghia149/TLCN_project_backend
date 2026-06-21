import {
  IntegratedExecutableLanguage,
  IntegratedExecutableLanguageKey,
} from '@backend/shared/types';

export const SUPPORTED_LANGUAGE_REGISTRY: IntegratedExecutableLanguage[] = [
  {
    key: 'cpp',
    label: 'C++',
    displayName: 'C++',
    monacoLanguage: 'cpp',
    sortOrder: 0,
  },
  {
    key: 'java',
    label: 'Java',
    displayName: 'Java',
    monacoLanguage: 'java',
    sortOrder: 1,
  },
  {
    key: 'python',
    label: 'Python',
    displayName: 'Python',
    monacoLanguage: 'python',
    sortOrder: 2,
  },
];

export function getIntegratedExecutableLanguages(): IntegratedExecutableLanguage[] {
  return [...SUPPORTED_LANGUAGE_REGISTRY];
}

export function getIntegratedExecutableLanguageKeys(): IntegratedExecutableLanguageKey[] {
  return SUPPORTED_LANGUAGE_REGISTRY.map(language => language.key);
}

export function isIntegratedExecutableLanguageKey(
  value: string,
): value is IntegratedExecutableLanguageKey {
  return getIntegratedExecutableLanguageKeys().includes(
    value as IntegratedExecutableLanguageKey,
  );
}

export const getIntegratedLanguageKeys = getIntegratedExecutableLanguageKeys;
export const isIntegratedLanguageKey = isIntegratedExecutableLanguageKey;
