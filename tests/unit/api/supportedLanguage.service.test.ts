import {
  SupportedLanguageService,
  createSupportedLanguageService,
} from '../../../apps/api/src/services/supportedLanguage.service';
import { SupportedLanguageRepository } from '../../../apps/api/src/repositories/supportedLanguage.repository';

describe('SupportedLanguageService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns only active executable languages from the public catalog', async () => {
    const repository = {
      findActiveExecutableLanguages: jest.fn().mockResolvedValue([
        { id: 'lang-cpp', key: 'cpp', displayName: 'C++', sortOrder: 0, isActive: true },
        { id: 'lang-java', key: 'java', displayName: 'Java', sortOrder: 1, isActive: true },
      ]),
    } as any;
    const service = new SupportedLanguageService({ supportedLanguageRepository: repository });

    const result = await service.listActiveExecutableLanguages();

    expect(repository.findActiveExecutableLanguages).toHaveBeenCalledTimes(1);
    expect(result.map((language: { key: string }) => language.key)).toEqual(['cpp', 'java']);
  });

  it('updates a language through the admin flow', async () => {
    const repository = {
      updateCatalogEntry: jest.fn().mockResolvedValue({
        id: 'lang-python',
        key: 'python',
        displayName: 'Python 3',
        sortOrder: 2,
        isActive: false,
      }),
    } as any;
    const service = new SupportedLanguageService({ supportedLanguageRepository: repository });

    const result = await service.updateLanguage('lang-python', {
      displayName: 'Python 3',
      isActive: false,
      sortOrder: 2,
    });

    expect(repository.updateCatalogEntry).toHaveBeenCalledWith('lang-python', {
      displayName: 'Python 3',
      isActive: false,
      sortOrder: 2,
    });
    expect(result.isActive).toBe(false);
  });

  it('creates a service wired with a concrete repository', () => {
    const service = createSupportedLanguageService();

    expect(service).toBeInstanceOf(SupportedLanguageService);
    expect((service as any).supportedLanguageRepository).toBeInstanceOf(SupportedLanguageRepository);
  });
});
