import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { ProctoringBypassService } from '@backend/api/services/proctoring/proctoring-bypass.service';
import { ProctoringConsentService } from '@backend/api/services/proctoring/proctoring-consent.service';
import { ProctoringDataRequestService } from '@backend/api/services/proctoring/proctoring-data-request.service';
import { ProctoringFinalFlushService } from '@backend/api/services/proctoring/proctoring-final-flush.service';
import { ProctoringPrecheckService } from '@backend/api/services/proctoring/proctoring-precheck.service';
import { ProctoringSettingsService } from '@backend/api/services/proctoring/proctoring-settings.service';

type ProctoringControllerDependencies = {
  settingsService: ProctoringSettingsService;
  consentService: ProctoringConsentService;
  precheckService: ProctoringPrecheckService;
  bypassService: ProctoringBypassService;
  dataRequestService: ProctoringDataRequestService;
  finalFlushService: ProctoringFinalFlushService;
};

export class ProctoringController {
  constructor(private readonly deps: ProctoringControllerDependencies) {}

  async getSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.deps.settingsService.getSettingsBySlug(
      slug,
      req.user?.userId ?? null,
    );
    res.status(200).json(result);
  }

  async acceptConsent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.deps.consentService.acceptConsent(
      slug,
      req.user?.userId,
      req.body,
    );
    res.status(200).json(result);
  }

  async createPrecheck(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.deps.precheckService.createPrecheck(
      slug,
      req.user?.userId,
      req.body,
    );
    res.status(200).json(result);
  }

  async verifyBypass(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.deps.bypassService.verifyBypassCode(
      slug,
      req.user?.userId,
      req.body,
    );
    res.status(200).json(result);
  }

  async withdrawConsent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { participationId } = req.params as { participationId: string };
    const result = await this.deps.consentService.withdrawConsent(
      participationId,
      req.user?.userId,
    );
    res.status(200).json(result);
  }

  async createDataRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { participationId } = req.params as { participationId: string };
    const result = await this.deps.dataRequestService.createDataRequest(
      participationId,
      req.user?.userId,
      req.body,
    );
    res.status(200).json(result);
  }

  async submitFinalFlush(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { participationId } = req.params as { participationId: string };
    const result = await this.deps.finalFlushService.submitFinalFlush(
      participationId,
      req.user?.userId,
      req.body,
    );
    res.status(200).json(result);
  }
}
