import { SupportedLanguageService } from '../../../apps/api/src/services/supportedLanguage.service';
import { submissionMetadataInvalidator } from '../../../apps/api/src/services/submission-metadata-cache';

describe('SupportedLanguageService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('updates a catalog entry and invalidates the updated language key', async () => {
    const supportedLanguageRepository = {
      updateCatalogEntry: jest.fn().mockResolvedValue({
        id: 'lang-python',
        key: 'python',
        displayName: 'Python',
        isActive: false,
        sortOrder: 3,
      }),
    } as any;
    const invalidateSpy = jest
      .spyOn(submissionMetadataInvalidator, 'invalidateLanguage')
      .mockImplementation(() => undefined);
    const service = new SupportedLanguageService({ supportedLanguageRepository });

    const result = await service.updateLanguage('lang-python', { isActive: false });

    expect(supportedLanguageRepository.updateCatalogEntry).toHaveBeenCalledWith(
      'lang-python',
      { isActive: false },
    );
    expect(invalidateSpy).toHaveBeenCalledWith('python');
    expect(result).toEqual({
      id: 'lang-python',
      key: 'python',
      displayName: 'Python',
      isActive: false,
      sortOrder: 3,
    });
  });
});
