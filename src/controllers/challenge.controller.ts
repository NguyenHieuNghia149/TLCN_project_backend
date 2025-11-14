import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { ChallengeService } from '@/services/challenge.service';
import { BaseException, ErrorHandler } from '@/exceptions/auth.exceptions';
import {
  ProblemInput,
  UpdateSolutionVisibilityInput,
  CreateProblemSchema,
  UpdateSolutionVisibilitySchema,
} from '@/validations/problem.validation';
import { z } from 'zod';

const ListProblemsByTopicSchema = z.object({
  topicId: z.string().uuid('Invalid Topic ID'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z
    .object({
      createdAt: z.string().datetime(),
      id: z.string().uuid(),
    })
    .optional(),
});

export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  async createChallenge(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const challengeData = req.body as ProblemInput;
      const result = await this.challengeService.createChallenge(challengeData);

      res.status(201).json({
        success: true,
        message: 'Challenge created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async listProblemsByTopic(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { topicId } = req.params;
      const { limit, cursor } = req.query;

      if (!topicId) throw new BaseException('Topic ID is required', 400, 'MISSING_TOPIC_ID');

      const result = await this.challengeService.listProblemsByTopicInfinite({
        topicId,
        limit: limit ? parseInt(limit as string) : 10,
        cursor: cursor ? JSON.parse(cursor as string) : null,
        userId: req.user?.userId,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSolutionVisibility(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { solutionId } = req.params;
      const { isVisible } = req.body as UpdateSolutionVisibilityInput;

      if (!solutionId)
        throw new BaseException('Solution ID is required', 400, 'MISSING_SOLUTION_ID');

      const result = await this.challengeService.updateSolutionVisibility(solutionId, isVisible);

      res.status(200).json({
        success: true,
        message: 'Solution visibility updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTopicTags(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { topicId } = req.params;
      if (!topicId) throw new BaseException('Topic ID is required', 400, 'MISSING_TOPIC_ID');

      const tags = await this.challengeService.getTopicTags(topicId);
      return res.status(200).json({ success: true, data: { tags } });
    } catch (error) {
      next(error);
    }
  }

  async listProblemsByTopicAndTags(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { topicId } = req.params;
      const { tags, limit, cursor } = req.query;

      if (!topicId) throw new BaseException('Topic ID is required', 400, 'MISSING_TOPIC_ID');

      const tagsArray =
        typeof tags === 'string'
          ? tags
              .split(',')
              .map(t => t.trim())
              .filter(Boolean)
          : Array.isArray(tags)
            ? (tags as string[])
            : [];

      const result = await this.challengeService.listProblemsByTopicAndTags({
        topicId,
        tags: tagsArray,
        limit: limit ? parseInt(limit as string) : 10,
        cursor: cursor ? JSON.parse(cursor as string) : null,
        userId: req.user?.userId,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getChallengeById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { challengeId } = req.params;

      if (!challengeId) {
        throw new BaseException('Challenge ID is required', 400, 'MISSING_CHALLENGE_ID');
      }

      const result = await this.challengeService.getChallengeById(challengeId, req.user?.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateChallenge(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { challengeId } = req.params;
      const updateData = req.body as Partial<ProblemInput>;

      if (!challengeId) {
        throw new BaseException('Challenge ID is required', 400, 'MISSING_CHALLENGE_ID');
      }

      const result = await this.challengeService.updateChallenge(challengeId, updateData);

      res.status(200).json({
        success: true,
        message: 'Challenge updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteChallenge(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { challengeId } = req.params;

      if (!challengeId)
        throw new BaseException('Challenge ID is required', 400, 'MISSING_CHALLENGE_ID');

      await this.challengeService.deleteChallenge(challengeId);

      res.status(200).json({
        success: true,
        message: 'Challenge deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Error handling middleware
  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    // Handle Postgres unique violation for challenges/problems
    const anyError = error as any;
    if (anyError && anyError.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Resource already exists',
        code: 'DUPLICATE_RESOURCE',
        timestamp: new Date().toISOString(),
      });
    }

    if (error instanceof BaseException) {
      const errorResponse = ErrorHandler.getErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        message: errorResponse.message,
        code: errorResponse.code,
        timestamp: errorResponse.timestamp,
      });
    }

    // Log unexpected errors
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}

// Export validation schemas for use in routes
export {
  CreateProblemSchema as CreateChallengeSchema,
  ListProblemsByTopicSchema,
  UpdateSolutionVisibilitySchema,
};
