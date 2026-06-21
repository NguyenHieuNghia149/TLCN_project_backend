import { Request, Response } from 'express';

import { AppException } from '../exceptions/base.exception';
import { SupportedLanguageService } from '../services/supportedLanguage.service';

import { UpdateSupportedLanguageInput } from '@backend/shared/validations/supportedLanguage.validation';

export class SupportedLanguageController {
  constructor(private readonly supportedLanguageService: SupportedLanguageService) {}

  async listActiveLanguages(req: Request, res: Response): Promise<void> {
    const items = await this.supportedLanguageService.listActiveExecutableLanguages();
    res.status(200).json({ items });
  }

  async listAllLanguages(req: Request, res: Response): Promise<void> {
    const items = await this.supportedLanguageService.listAllLanguages();
    res.status(200).json({ items });
  }

  async updateLanguage(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id?: string };
    if (!id) {
      throw new AppException('Language ID is required', 400, 'MISSING_LANGUAGE_ID');
    }

    const result = await this.supportedLanguageService.updateLanguage(
      id,
      req.body as UpdateSupportedLanguageInput,
    );
    res.status(200).json(result);
  }
}

