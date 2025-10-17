import { Request, Response, NextFunction } from 'express';
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
    const challengeData = req.body as ProblemInput;
    const result = await this.challengeService.createChallenge(challengeData);

    res.status(201).json({
      success: true,
      message: 'Challenge created successfully',
      data: result,
    });
  }

  async listProblemsByTopic(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { topicId } = req.params;
    const { limit, cursor } = req.query;

    if (!topicId) {
      return res.status(400).json({
        success: false,
        message: 'Topic ID is required',
        code: 'MISSING_TOPIC_ID',
      });
    }

    const result = await this.challengeService.listProblemsByTopicInfinite({
      topicId,
      limit: limit ? parseInt(limit as string) : 10,
      cursor: cursor ? JSON.parse(cursor as string) : null,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  async updateSolutionVisibility(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { solutionId } = req.params;
    const { isVisible } = req.body as UpdateSolutionVisibilityInput;

    if (!solutionId) {
      return res.status(400).json({
        success: false,
        message: 'Solution ID is required',
        code: 'MISSING_SOLUTION_ID',
      });
    }

    const result = await this.challengeService.updateSolutionVisibility(solutionId, isVisible);

    res.status(200).json({
      success: true,
      message: 'Solution visibility updated successfully',
      data: result,
    });
  }

  async getTopicTags(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { topicId } = req.params;
    if (!topicId) {
      return res
        .status(400)
        .json({ success: false, message: 'Topic ID is required', code: 'MISSING_TOPIC_ID' });
    }

    const tags = await this.challengeService.getTopicTags(topicId);
    res.status(200).json({ success: true, data: { tags } });
  }

  async listProblemsByTopicAndTags(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { topicId } = req.params;
    const { tags, limit, cursor } = req.query;

    if (!topicId) {
      return res
        .status(400)
        .json({ success: false, message: 'Topic ID is required', code: 'MISSING_TOPIC_ID' });
    }

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
    });

    res.status(200).json({ success: true, data: result });
  }

  async getChallengeById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { challengeId } = req.params;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        message: 'Challenge ID is required',
        code: 'MISSING_CHALLENGE_ID',
      });
    }

    const result = await this.challengeService.getChallengeById(challengeId);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  async updateChallenge(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { challengeId } = req.params;
    const updateData = req.body as Partial<ProblemInput>;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        message: 'Challenge ID is required',
        code: 'MISSING_CHALLENGE_ID',
      });
    }

    const result = await this.challengeService.updateChallenge(challengeId, updateData);

    res.status(200).json({
      success: true,
      message: 'Challenge updated successfully',
      data: result,
    });
  }

  async deleteChallenge(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { challengeId } = req.params;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        message: 'Challenge ID is required',
        code: 'MISSING_CHALLENGE_ID',
      });
    }

    await this.challengeService.deleteChallenge(challengeId);

    res.status(200).json({
      success: true,
      message: 'Challenge deleted successfully',
    });
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
    console.error('Unexpected error:', error);

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
