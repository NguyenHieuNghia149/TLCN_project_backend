import {
  getIntegratedExecutableLanguageKeys,
  getIntegratedExecutableLanguages,
  isIntegratedExecutableLanguageKey,
} from '../../../packages/shared/utils/supported-languages';

describe('supported language registry', () => {
  it('exposes integrated executable languages in stable order', () => {
    expect(getIntegratedExecutableLanguageKeys()).toEqual(['cpp', 'java', 'python']);
    expect(getIntegratedExecutableLanguages().map(language => language.label)).toEqual([
      'C++',
      'Java',
      'Python',
    ]);
  });

  it('recognizes integrated keys and rejects unknown keys', () => {
    expect(isIntegratedExecutableLanguageKey('cpp')).toBe(true);
    expect(isIntegratedExecutableLanguageKey('javascript')).toBe(false);
  });
});
