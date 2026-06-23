import { Response } from 'express';

import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { ProctoringAdminReviewService } from '@backend/api/services/proctoring/proctoring-admin-review.service';
import { ProctoringBypassService } from '@backend/api/services/proctoring/proctoring-bypass.service';
import { ProctoringSettingsService } from '@backend/api/services/proctoring/proctoring-settings.service';

type AdminProctoringControllerDependencies = {
  settingsService: ProctoringSettingsService;
  bypassService: ProctoringBypassService;
  reviewService: ProctoringAdminReviewService;
};

export class AdminProctoringController {
  constructor(private readonly deps: AdminProctoringControllerDependencies) {}

  private getActor(req: AuthenticatedRequest) {
    return {
      userId: req.user?.userId,
      role: req.user?.role,
    };
  }

  async updateSettings(req: AuthenticatedRequest, res: Response) {
    const { examId } = req.params as { examId: string };
    const result = await this.deps.settingsService.updateSettings(
      examId,
      req.user?.userId,
      req.body,
    );
    res.status(200).json(result);
  }

  async issueBypassCode(req: AuthenticatedRequest, res: Response) {
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

  async getReview(req: AuthenticatedRequest, res: Response) {
    const { examId, participationId } = req.params as {
      examId: string;
      participationId: string;
    };
    const result = await this.deps.reviewService.getReview(
      examId,
      participationId,
      this.getActor(req),
      {
        eventName:
          typeof req.query.eventName === 'string'
            ? req.query.eventName
            : undefined,
        limit:
          req.query.limit === undefined
            ? undefined
            : Number(req.query.limit),
        offset:
          req.query.offset === undefined
            ? undefined
            : Number(req.query.offset),
      },
    );
    res.status(200).json(result);
  }

  async recompute(req: AuthenticatedRequest, res: Response) {
    const { examId, participationId } = req.params as {
      examId: string;
      participationId: string;
    };
    const result = await this.deps.reviewService.recompute(
      examId,
      participationId,
      this.getActor(req),
      req.body,
    );
    res.status(200).json(result);
  }

  async recordReviewDecision(req: AuthenticatedRequest, res: Response) {
    const { examId, participationId } = req.params as {
      examId: string;
      participationId: string;
    };
    const result = await this.deps.reviewService.recordReviewDecision(
      examId,
      participationId,
      this.getActor(req),
      req.body,
    );
    res.status(200).json(result);
  }

  async recordReviewLabel(req: AuthenticatedRequest, res: Response) {
    const { examId, participationId } = req.params as {
      examId: string;
      participationId: string;
    };
    const result = await this.deps.reviewService.recordReviewLabel(
      examId,
      participationId,
      this.getActor(req),
      req.body,
    );
    res.status(200).json(result);
  }

  async translateLlmSummary(req: AuthenticatedRequest, res: Response) {
    const { examId, participationId } = req.params as {
      examId: string;
      participationId: string;
    };
    const result = await this.deps.reviewService.translateLlmSummary(
      examId,
      participationId,
      this.getActor(req),
      req.body,
    );
    res.status(200).json(result);
  }
}
