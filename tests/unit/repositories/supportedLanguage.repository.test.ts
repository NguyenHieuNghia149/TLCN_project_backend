import { SupportedLanguageRepository } from '../../../apps/api/src/repositories/supportedLanguage.repository';

describe('SupportedLanguageRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns active executable languages ordered by sortOrder', async () => {
    const repository = new SupportedLanguageRepository();
    const orderBy = jest.fn().mockResolvedValue([
      { key: 'cpp', displayName: 'C++', sortOrder: 0, isActive: true },
      { key: 'java', displayName: 'Java', sortOrder: 1, isActive: true },
      { key: 'python', displayName: 'Python', sortOrder: 2, isActive: true },
    ]);
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    (repository as any).db = { select };

    const result = await repository.findActiveExecutableLanguages();

    expect(result.map((language: { key: string }) => language.key)).toEqual([
      'cpp',
      'java',
      'python',
    ]);
  });
  it('resolves an active executable language by key', async () => {
    const repository = new SupportedLanguageRepository();
    const limit = jest.fn().mockResolvedValue([
      { id: 'lang-python', key: 'python', displayName: 'Python', sortOrder: 2, isActive: true },
    ]);
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    (repository as any).db = { select };

    const result = await repository.findActiveExecutableLanguageByKey('python');

    expect(result).toMatchObject({ id: 'lang-python', key: 'python' });
  });
});


