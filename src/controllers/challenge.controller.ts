import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { ChallengeService } from '@/services/challenge.service';
import { AppException } from '@/exceptions/base.exception';
import {
  ProblemInput,
  UpdateSolutionVisibilityInput,
  CreateProblemSchema,
  UpdateSolutionVisibilitySchema,
  UpdateProblemSchema,
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
      message: 'Challenge created successfully',
      ...result,
    });
  }

  async getAllChallenges(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.q as string) || undefined;
    const sortField = (req.query.sortField as string) || undefined;
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;

    const result = await this.challengeService.getAllChallenges(
      page,
      limit,
      search,
      sortField,
      sortOrder
    );

    res.status(200).json(result);
  }

  async listProblemsByTopic(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { topicId } = req.params as { topicId: string };
    const { limit, cursor } = req.query;

    if (!topicId) throw new AppException('Topic ID is required', 400, 'MISSING_TOPIC_ID');

    // Validate and parse limit
    let parsedLimit = 10;
    if (limit) {
      const numLimit = parseInt(limit as string, 10);
      if (isNaN(numLimit) || numLimit < 1) {
        throw new AppException('Limit must be a positive number', 400, 'INVALID_LIMIT');
      }
      if (numLimit > 50) {
        throw new AppException('Limit cannot exceed 50', 400, 'LIMIT_TOO_LARGE');
      }
      parsedLimit = numLimit;
    }

    // Validate and parse cursor
    let parsedCursor: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        if (typeof cursor === 'string') {
          parsedCursor = JSON.parse(cursor);
        } else if (typeof cursor === 'object') {
          parsedCursor = cursor as { createdAt: string; id: string };
        }

        // Validate cursor structure
        if (parsedCursor && (!parsedCursor.createdAt || !parsedCursor.id)) {
          throw new AppException('Invalid cursor format', 400, 'INVALID_CURSOR');
        }
      } catch (parseError) {
        throw new AppException('Invalid cursor format', 400, 'INVALID_CURSOR');
      }
    }

    const result = await this.challengeService.listProblemsByTopicInfinite({
      topicId: topicId as string,
      limit: parsedLimit,
      cursor: parsedCursor,
      userId: req.user?.userId,
    });

    res.status(200).json(result);
  }

  async updateSolutionVisibility(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { solutionId } = req.params as { solutionId: string };
    const { isVisible } = req.body as UpdateSolutionVisibilityInput;

    if (!solutionId) throw new AppException('Solution ID is required', 400, 'MISSING_SOLUTION_ID');

    const result = await this.challengeService.updateSolutionVisibility(
      solutionId as string,
      isVisible
    );

    res.status(200).json({
      message: 'Solution visibility updated successfully',
      ...result,
    });
  }

  async getTopicTags(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { topicId } = req.params as { topicId: string };
    if (!topicId) throw new AppException('Topic ID is required', 400, 'MISSING_TOPIC_ID');

    const tags = await this.challengeService.getTopicTags(topicId as string);
    res.status(200).json({ tags });
  }

  async getAllTags(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const tags = await this.challengeService.getAllTags();
    res.status(200).json({ tags });
  }

  async listProblemsByTopicAndTags(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { topicId } = req.params;
    const { tags, limit, cursor } = req.query;

    if (!topicId) throw new AppException('Topic ID is required', 400, 'MISSING_TOPIC_ID');

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
      topicId: topicId as string,
      tags: tagsArray,
      limit: limit ? parseInt(limit as string) : 10,
      cursor: cursor ? JSON.parse(cursor as string) : null,
      userId: req.user?.userId,
    });

    res.status(200).json(result);
  }

  async getChallengeById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { challengeId } = req.params as { challengeId: string };

    if (!challengeId) {
      throw new AppException('Challenge ID is required', 400, 'MISSING_CHALLENGE_ID');
    }

    // Check query parameter to show all testcases (for admin create/edit pages)
    const showAllTestcases = req.query.showAll === 'true';

    const result = await this.challengeService.getChallengeById(
      challengeId as string,
      req.user?.userId,
      {
        showAllTestcases,
      }
    );

    res.status(200).json(result);
  }

  async updateChallenge(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { challengeId } = req.params as { challengeId: string };
    const updateData = req.body as Partial<ProblemInput>;

    if (!challengeId) {
      throw new AppException('Challenge ID is required', 400, 'MISSING_CHALLENGE_ID');
    }

    const result = await this.challengeService.updateChallenge(challengeId as string, updateData);

    res.status(200).json({
      message: 'Challenge updated successfully',
      ...result,
    });
  }

  async deleteChallenge(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { challengeId } = req.params as { challengeId: string };

    if (!challengeId)
      throw new AppException('Challenge ID is required', 400, 'MISSING_CHALLENGE_ID');

    await this.challengeService.deleteChallenge(challengeId as string);

    res.status(200).json({
      message: 'Challenge deleted successfully',
    });
  }
}

// Export validation schemas for use in routes
export {
  CreateProblemSchema as CreateChallengeSchema,
  UpdateProblemSchema as UpdateChallengeSchema,
  ListProblemsByTopicSchema,
  UpdateSolutionVisibilitySchema,
};
