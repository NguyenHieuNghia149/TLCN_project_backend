import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { ProctoringBypassService } from '@backend/api/services/proctoring/proctoring-bypass.service';
import { ProctoringSettingsService } from '@backend/api/services/proctoring/proctoring-settings.service';

type AdminProctoringControllerDependencies = {
  settingsService: ProctoringSettingsService;
  bypassService: ProctoringBypassService;
};

export class AdminProctoringController {
  constructor(private readonly deps: AdminProctoringControllerDependencies) {}

  async updateSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { examId } = req.params as { examId: string };
    const result = await this.deps.settingsService.updateSettings(
      examId,
      req.user?.userId,
      req.body,
    );
    res.status(200).json(result);
  }

  async issueBypassCode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { examId, participationId } = req.params as {
      examId: string;
      participationId: string;
    };
    const result = await this.deps.bypassService.issueBypassCode(
      examId,
      req.user?.userId,
      {
        ...req.body,
        participationId,
      },
    );
    res.status(200).json(result);
  }
}
