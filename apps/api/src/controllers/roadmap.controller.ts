import { NextFunction, Request, Response } from 'express';
import { successResponse } from '@backend/shared/utils';
import { AppException } from '@backend/api/exceptions/base.exception';
import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { RoadmapService } from '@backend/api/services/roadmap.service';
import {
  AddRoadmapItemSchema,
  CreateRoadmapSchema,
  MarkRoadmapItemSchema,
  ReorderRoadmapItemsSchema,
  UpdateRoadmapSchema,
} from '@backend/shared/validations/roadmap.validation';

export class RoadmapController {
  constructor(private readonly roadmapService: RoadmapService) {}

  createRoadmap = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const input = CreateRoadmapSchema.parse(req.body);
    const roadmap = await this.roadmapService.createRoadmap(input, userId);
    res.status(201).json(successResponse(roadmap));
  };

  listRoadmaps = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);
    const visibility = req.query.visibility as 'public' | 'private' | undefined;
    const createdBy = req.query.createdBy as string | undefined;

    const data = await this.roadmapService.listRoadmaps({ limit, offset, visibility, createdBy });
    res.status(200).json(successResponse(data));
  };

  getRoadmapById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const roadmapId = req.params.id as string;
    if (!roadmapId) {
      throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');
    }
    const data = await this.roadmapService.getRoadmapById(roadmapId);
    if (!data.roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }
    res.status(200).json(successResponse(data));
  };

  updateRoadmap = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    if (!roadmapId) throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');

    const input = UpdateRoadmapSchema.parse(req.body);
    const updated = await this.roadmapService.updateRoadmap(roadmapId, userId, input);
    res.status(200).json(successResponse(updated));
  };

  deleteRoadmap = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    if (!roadmapId) throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');

    await this.roadmapService.deleteRoadmap(roadmapId, userId);
    res.status(200).json(successResponse({ deleted: true }));
  };

  addItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    if (!roadmapId) throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');

    const input = AddRoadmapItemSchema.parse(req.body);
    const item = await this.roadmapService.addItemToRoadmap({ roadmapId, userId, ...input });
    res.status(201).json(successResponse(item));
  };

  removeItem = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    const itemId = req.params.itemId as string;
    if (!roadmapId || !itemId) throw new AppException('Invalid path params', 400, 'INVALID_PARAMS');

    await this.roadmapService.removeItemFromRoadmap(roadmapId, userId, itemId);
    res.status(200).json(successResponse({ deleted: true }));
  };

  reorderItems = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    if (!roadmapId) throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');

    const { itemIds } = ReorderRoadmapItemsSchema.parse(req.body);
    const items = await this.roadmapService.reorderItems(roadmapId, userId, itemIds);
    res.status(200).json(successResponse(items));
  };

  getUserProgress = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    if (!roadmapId) throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');

    const stats = await this.roadmapService.getUserProgress(userId, roadmapId);
    res.status(200).json(successResponse(stats));
  };

  markItemCompleted = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    if (!roadmapId) throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');

    const { itemId } = MarkRoadmapItemSchema.parse(req.body);
    await this.roadmapService.markItemCompleted(userId, roadmapId, itemId);
    res.status(200).json(successResponse({ queued: true }));
  };

  markItemIncomplete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    const roadmapId = req.params.id as string;
    if (!roadmapId) throw new AppException('Roadmap ID is required', 400, 'ROADMAP_ID_REQUIRED');

    const { itemId } = MarkRoadmapItemSchema.parse(req.body);
    await this.roadmapService.markItemIncomplete(userId, roadmapId, itemId);
    res.status(200).json(successResponse({ queued: true }));
  };

  listUserRoadmaps = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new AppException('Authentication required', 401, 'UNAUTHORIZED');

    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);
    const data = await this.roadmapService.listRoadmaps({ limit, offset, createdBy: userId });
    res.status(200).json(successResponse(data));
  };
}
