import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { ExamAccessService } from '@backend/api/services/exam-access.service';

export class AdminExamController {
  constructor(private readonly examAccessService: ExamAccessService) {}

  async listExams(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const result = await this.examAccessService.listAdminExams({
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      createdBy: (req.query.createdBy as string) || undefined,
      search: (req.query.search as string) || undefined,
    });
    res.status(200).json(result);
  }

  async getExamById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { id } = req.params as { id: string };
    const result = await this.examAccessService.getAdminExamById(id);
    res.status(200).json(result);
  }

  async createExam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const result = await this.examAccessService.createAdminExam(actorId, req.body);
    res.status(201).json(result);
  }

  async updateExam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id } = req.params as { id: string };
    const result = await this.examAccessService.updateAdminExam(id, actorId, req.body);
    res.status(200).json(result);
  }

  async publishExam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id } = req.params as { id: string };
    const result = await this.examAccessService.publishExam(id, actorId);
    res.status(200).json(result);
  }

  async getParticipants(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const { id } = req.params as { id: string };
    const result = await this.examAccessService.listAdminExamParticipants(id);
    res.status(200).json({ data: result });
  }

  async addParticipants(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id } = req.params as { id: string };
    const result = await this.examAccessService.addAdminExamParticipants(id, actorId, req.body);
    res.status(201).json({ data: result });
  }

  async importParticipants(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    return this.addParticipants(req, res, next);
  }

  async approveParticipant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id, participantId } = req.params as { id: string; participantId: string };
    const result = await this.examAccessService.approveParticipant(id, participantId, actorId);
    res.status(200).json(result);
  }

  async rejectParticipant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id, participantId } = req.params as { id: string; participantId: string };
    const result = await this.examAccessService.rejectParticipant(id, participantId, actorId);
    res.status(200).json(result);
  }

  async revokeParticipant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id, participantId } = req.params as { id: string; participantId: string };
    const result = await this.examAccessService.revokeParticipant(id, participantId, actorId);
    res.status(200).json(result);
  }

  async resendInvite(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id, participantId } = req.params as { id: string; participantId: string };
    const result = await this.examAccessService.resendInvite(id, participantId, actorId);
    res.status(200).json(result);
  }

  async bindAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id, participantId } = req.params as { id: string; participantId: string };
    const result = await this.examAccessService.bindParticipantAccount(
      id,
      participantId,
      actorId,
      req.body.userId,
    );
    res.status(200).json(result);
  }

  async mergeParticipants(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { id } = req.params as { id: string };
    const result = await this.examAccessService.mergeParticipants(id, actorId, req.body);
    res.status(200).json(result);
  }
}
