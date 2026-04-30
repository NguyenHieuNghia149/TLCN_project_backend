import { logger } from '@backend/shared/utils';
import { AppException } from '@backend/api/exceptions/base.exception';
import {
  createRoadmapItemRepository,
  RoadmapItemRepository,
} from '@backend/api/repositories/roadmapItem.repository';
import {
  createRoadmapProgressRepository,
  RoadmapProgressRepository,
} from '@backend/api/repositories/roadmapProgress.repository';
import {
  createRoadmapRepository,
  RoadmapRepository,
} from '@backend/api/repositories/roadmap.repository';
import { LessonRepository } from '@backend/api/repositories/lesson.repository';
import { ProblemRepository } from '@backend/api/repositories/problem.repository';
import {
  CreateRoadmapInput,
  RoadmapProgressStats,
  UpdateRoadmapInput,
} from '@backend/shared/validations/roadmap.validation';

type RoadmapServiceDependencies = {
  roadmapRepository: RoadmapRepository;
  roadmapItemRepository: RoadmapItemRepository;
  roadmapProgressRepository: RoadmapProgressRepository;
  lessonRepository: LessonRepository;
  problemRepository: ProblemRepository;
};

export class RoadmapService {
  private roadmapRepository: RoadmapRepository;
  private roadmapItemRepository: RoadmapItemRepository;
  private roadmapProgressRepository: RoadmapProgressRepository;
  private lessonRepository: LessonRepository;
  private problemRepository: ProblemRepository;

  constructor(deps: RoadmapServiceDependencies) {
    this.roadmapRepository = deps.roadmapRepository;
    this.roadmapItemRepository = deps.roadmapItemRepository;
    this.roadmapProgressRepository = deps.roadmapProgressRepository;
    this.lessonRepository = deps.lessonRepository;
    this.problemRepository = deps.problemRepository;
  }

  async createRoadmap(input: CreateRoadmapInput, createdBy: string) {
    return this.roadmapRepository.create({
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility,
      createdBy,
    });
  }

  async getRoadmapById(roadmapId: string) {
    return this.roadmapRepository.getRoadmapDetail(roadmapId);
  }

  async updateRoadmap(roadmapId: string, userId: string, input: UpdateRoadmapInput) {
    const roadmap = await this.roadmapRepository.findById(roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }
    this.ensureOwnerOrAdmin(roadmap.createdBy, userId);
    const updated = await this.roadmapRepository.update(roadmapId, input);
    if (!updated) {
      throw new AppException('Failed to update roadmap', 500, 'ROADMAP_UPDATE_FAILED');
    }
    return updated;
  }

  async deleteRoadmap(roadmapId: string, userId: string): Promise<void> {
    const roadmap = await this.roadmapRepository.findById(roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }
    this.ensureOwnerOrAdmin(roadmap.createdBy, userId);
    await this.roadmapRepository.deleteRoadmapCascade(roadmapId);
  }

  async listRoadmaps(params: {
    limit: number;
    offset: number;
    visibility?: 'public' | 'private';
    createdBy?: string;
  }) {
    const roadmaps = await this.roadmapRepository.listRoadmaps(params);
    const total = await this.roadmapRepository.countRoadmaps(params);
    return { roadmaps, total };
  }

  async addItemToRoadmap(input: {
    roadmapId: string;
    userId: string;
    itemType: 'lesson' | 'problem';
    itemId: string;
  }) {
    const roadmap = await this.roadmapRepository.findById(input.roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }
    this.ensureOwnerOrAdmin(roadmap.createdBy, input.userId);

    if (input.itemType === 'lesson') {
      const lesson = await this.lessonRepository.findById(input.itemId);
      if (!lesson) throw new AppException('Referenced item not found', 404, 'ITEM_NOT_FOUND');
    } else {
      const problem = await this.problemRepository.findById(input.itemId);
      if (!problem) throw new AppException('Referenced item not found', 404, 'ITEM_NOT_FOUND');
    }

    const items = await this.roadmapItemRepository.listItemsByRoadmap(input.roadmapId);
    return this.roadmapItemRepository.addItemToRoadmap({
      roadmapId: input.roadmapId,
      itemType: input.itemType,
      itemId: input.itemId,
      order: items.length + 1,
    });
  }

  async removeItemFromRoadmap(roadmapId: string, userId: string, itemId: string): Promise<void> {
    const roadmap = await this.roadmapRepository.findById(roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }
    this.ensureOwnerOrAdmin(roadmap.createdBy, userId);

    const deleted = await this.roadmapItemRepository.removeItemFromRoadmap(roadmapId, itemId);
    if (!deleted) {
      throw new AppException('Roadmap item not found', 404, 'ROADMAP_ITEM_NOT_FOUND');
    }
  }

  async reorderItems(roadmapId: string, userId: string, itemIds: string[]) {
    const roadmap = await this.roadmapRepository.findById(roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }
    this.ensureOwnerOrAdmin(roadmap.createdBy, userId);
    return this.roadmapItemRepository.reorderItems(roadmapId, itemIds);
  }

  async getUserProgress(userId: string, roadmapId: string): Promise<RoadmapProgressStats> {
    return this.roadmapProgressRepository.getCompletionStats(userId, roadmapId);
  }

  async markItemCompleted(userId: string, roadmapId: string, itemId: string): Promise<void> {
    // Service receives synchronous call from controller and schedules side-effect internally.
    setImmediate(async () => {
      try {
        await this.roadmapProgressRepository.markItemCompleted(userId, roadmapId, itemId);
      } catch (error) {
        logger.error({
          message: 'Failed to mark roadmap item completed',
          userId,
          roadmapId,
          itemId,
          error,
        });
      }
    });
  }

  async markItemIncomplete(userId: string, roadmapId: string, itemId: string): Promise<void> {
    // Service receives synchronous call from controller and schedules side-effect internally.
    setImmediate(async () => {
      try {
        await this.roadmapProgressRepository.markItemIncomplete(userId, roadmapId, itemId);
      } catch (error) {
        logger.error({
          message: 'Failed to mark roadmap item incomplete',
          userId,
          roadmapId,
          itemId,
          error,
        });
      }
    });
  }

  async getProgressStats(userId: string, limit: number = 50, offset: number = 0) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const rows = await this.roadmapProgressRepository.listProgressByUser(userId, safeLimit, offset);
    const statsMap = new Map<string, RoadmapProgressStats>();

    for (const row of rows) {
      const stats = await this.roadmapProgressRepository.getCompletionStats(userId, row.roadmapId);
      statsMap.set(row.roadmapId, stats);
    }
    return statsMap;
  }

  private ensureOwnerOrAdmin(ownerId: string, userId: string): void {
    if (ownerId !== userId) {
      throw new AppException('Forbidden', 403, 'FORBIDDEN');
    }
  }
}

export function createRoadmapService(): RoadmapService {
  return new RoadmapService({
    roadmapRepository: createRoadmapRepository(),
    roadmapItemRepository: createRoadmapItemRepository(),
    roadmapProgressRepository: createRoadmapProgressRepository(),
    lessonRepository: new LessonRepository(),
    problemRepository: new ProblemRepository(),
  });
}
