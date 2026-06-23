import { NextFunction, Request, Response } from 'express';

import { ExamAccessService } from '@backend/api/services/exam-access.service';
import { ExamService } from '@backend/api/services/exam.service';
import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import {
  CSRF_COOKIE_NAME,
  setAccessTokenCookie,
  setCsrfTokenCookie,
  setRefreshTokenCookie,
} from '@backend/api/utils/cookie-auth';
import { randomBytes } from 'crypto';

function resolveCsrfToken(req: Request): string {
  const cookieValue = req.cookies?.[CSRF_COOKIE_NAME];

  if (typeof cookieValue === 'string' && cookieValue.trim().length > 0) {
    return cookieValue;
  }

  return randomBytes(32).toString('hex');
}

export class PublicExamController {
  constructor(private readonly examAccessService: ExamAccessService) {}

  async getPublicExam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.examAccessService.getPublicExamBySlug(slug, req.user?.userId ?? null);
    res.status(200).json(result);
  }

  async register(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.examAccessService.registerForExam(slug, {
      ...req.body,
      userId: req.user?.userId,
    });
    const { created, ...responseBody } = result as Record<string, unknown> & {
      created?: boolean;
    };
    res.status(created ? 201 : 200).json(responseBody);
  }

  async resolveInvite(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.examAccessService.resolveInvite(slug, {
      ...req.body,
      userId: req.user?.userId ?? null,
    });
    res.status(200).json(result);
  }

  async sendOtp(req: Request, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.examAccessService.sendOtp(slug, {
      ...req.body,
      ipAddress: req.ip,
    });
    res.status(200).json(result);
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.examAccessService.verifyOtp(slug, req.body);
    const tokens = result.tokens as
      | { accessToken: string; refreshToken: string; expiresIn?: number }
      | undefined;

    if (tokens?.accessToken) {
      setAccessTokenCookie(res, tokens.accessToken, tokens.expiresIn ?? 15 * 60 * 1000);
    }
    if (tokens?.refreshToken) {
      setRefreshTokenCookie(res, tokens.refreshToken, 7 * 24 * 60 * 60 * 1000);
    }
    if (tokens) {
      setCsrfTokenCookie(res, resolveCsrfToken(req));
    }

    if (tokens) {
      const { tokens: _tokens, ...resultWithoutTokens } = result as typeof result & {
        tokens?: typeof tokens;
      };
      res.status(200).json(resultWithoutTokens);
      return;
    }

    res.status(200).json(result);
  }
}

export class ExamAccessController {
  constructor(
    private readonly examAccessService: ExamAccessService,
    private readonly legacyExamService: ExamService,
  ) {}

  async getAccessState(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { slug } = req.params as { slug: string };
    const result = await this.examAccessService.getAccessState(slug, req.user?.userId ?? null);
    res.status(200).json(result);
  }

  async startEntrySession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { id } = req.params as { id: string };
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const proctoringStartInput = this.extractProctoringStartInput(req.body);
    const result = proctoringStartInput
      ? await this.examAccessService.startEntrySession(
          id,
          userId,
          req.body?.examPassword,
          proctoringStartInput,
        )
      : await this.examAccessService.startEntrySession(id, userId, req.body?.examPassword);
    res.status(200).json(result);
  }

  async syncSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (req.body?.sessionId && !req.body?.participationId) {
      const ok = await this.legacyExamService.syncSession(
        req.body.sessionId,
        req.body.answers,
        req.body.clientTimestamp,
      );
      res.status(200).json({ success: ok });
      return;
    }

    const result = await this.examAccessService.syncParticipation(userId, {
      participationId: req.body.participationId ?? req.body.sessionId,
      answers: req.body.answers,
    });
    res.status(200).json(result);
  }

  async submitExam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { slug } = req.params as { slug: string };
    if (req.body?.participationId) {
      const result = await this.legacyExamService.submitExam(req.body.participationId, userId);
      res.status(200).json(result);
      return;
    }

    const proctoringSubmitInput = this.extractProctoringSubmitInput(req.body);
    const result = proctoringSubmitInput
      ? await this.examAccessService.submitActiveParticipation(slug, userId, proctoringSubmitInput)
      : await this.examAccessService.submitActiveParticipation(slug, userId);
    res.status(200).json(result);
  }

  private extractProctoringStartInput(body: any) {
    if (
      !body?.clientSessionId &&
      !body?.consentRecordId &&
      !body?.precheckId &&
      !body?.bypassCode &&
      !body?.bypassCodeId
    ) {
      return undefined;
    }

    return {
      clientSessionId: body.clientSessionId,
      consentRecordId: body.consentRecordId,
      precheckId: body.precheckId,
      bypassCode: body.bypassCode,
      bypassCodeId: body.bypassCodeId,
    };
  }

  private extractProctoringSubmitInput(body: any) {
    if (!body?.submitAttemptId && !body?.finalFlushReceiptId) {
      return undefined;
    }

    return {
      submitAttemptId: body.submitAttemptId,
      finalFlushReceiptId: body.finalFlushReceiptId,
    };
  }
}
