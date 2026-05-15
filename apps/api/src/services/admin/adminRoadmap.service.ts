import { and, eq, max } from 'drizzle-orm';
import { logger } from '@backend/shared/utils';
import { AppException } from '@backend/api/exceptions/base.exception';
import {
  createRoadmapRepository,
  RoadmapRepository,
} from '@backend/api/repositories/roadmap.repository';
import { LessonRepository } from '@backend/api/repositories/lesson.repository';
import { ProblemRepository } from '@backend/api/repositories/problem.repository';
import { roadmapItems } from '@backend/shared/db/schema';
import { db } from '@backend/shared/db/connection';
import { createRoadmapItemRepository, RoadmapItemRepository } from '@backend/api/repositories/roadmapItem.repository';

type AdminRoadmapListFilters = {
  keyword?: string;
  createdBy?: string;
  visibility?: 'public' | 'private';
  createdAtFrom?: string;
  createdAtTo?: string;
  limit: number;
  offset: number;
};

export class AdminRoadmapService {
  constructor(
    private readonly roadmapRepository: RoadmapRepository,
    private readonly lessonRepository: LessonRepository,
    private readonly problemRepository: ProblemRepository,
    private readonly roadmapItemRepository: RoadmapItemRepository
  ) {}

  async listRoadmaps(filters: AdminRoadmapListFilters) {
    const createdAtFrom = filters.createdAtFrom ? new Date(filters.createdAtFrom) : undefined;
    const createdAtTo = filters.createdAtTo ? new Date(filters.createdAtTo) : undefined;

    if (createdAtFrom && Number.isNaN(createdAtFrom.getTime())) {
      throw new AppException('Invalid createdAtFrom', 400, 'INVALID_DATE');
    }
    if (createdAtTo && Number.isNaN(createdAtTo.getTime())) {
      throw new AppException('Invalid createdAtTo', 400, 'INVALID_DATE');
    }

    const limit = Math.min(100, Math.max(1, filters.limit));
    const offset = Math.max(0, filters.offset);

    const [items, total] = await Promise.all([
      this.roadmapRepository.adminListRoadmaps({
        limit,
        offset,
        keyword: filters.keyword,
        createdBy: filters.createdBy,
        visibility: filters.visibility,
        createdAtFrom,
        createdAtTo,
      }),
      this.roadmapRepository.adminCountRoadmaps({
        keyword: filters.keyword,
        createdBy: filters.createdBy,
        visibility: filters.visibility,
        createdAtFrom,
        createdAtTo,
      }),
    ]);

    return {
      roadmaps: items,
      pagination: { limit, offset, total },
    };
  }

  async getRoadmapDetail(id: string) {
    const detail = await this.roadmapRepository.adminGetRoadmapDetail(id);
    if (!detail.roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }
    return detail;
  }

  async updateVisibility(params: { id: string; visibility: 'public' | 'private'; adminId: string }) {
    const roadmap = await this.roadmapRepository.findById(params.id);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    const updated = await this.roadmapRepository.update(params.id, { visibility: params.visibility } as any);
    if (!updated) {
      throw new AppException('Failed to update roadmap visibility', 500, 'UPDATE_FAILED');
    }

    logger.info({
      action: 'ADMIN_ROADMAP_VISIBILITY_UPDATED',
      adminId: params.adminId,
      roadmapId: params.id,
      visibility: params.visibility,
    });

    return updated;
  }

  async createRoadmap(params: {
    title: string;
    description?: string;
    visibility?: 'public' | 'private';
    createdBy: string;
  }) {
    if (!params.title || params.title.trim().length === 0) {
      throw new AppException('Title is required', 400, 'INVALID_INPUT');
    }

    const roadmap = await this.roadmapRepository.create({
      title: params.title.trim(),
      description: params.description?.trim() || null,
      visibility: params.visibility || 'public',
      createdBy: params.createdBy,
    });

    logger.info({
      action: 'ADMIN_ROADMAP_CREATED',
      adminId: params.createdBy,
      roadmapId: roadmap.id,
      title: roadmap.title,
    });

    return roadmap;
  }

  async deleteRoadmap(params: { id: string; adminId: string }) {
    const deleted = await this.roadmapRepository.deleteRoadmapCascade(params.id);
    if (!deleted) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    logger.info({
      action: 'ADMIN_ROADMAP_DELETED',
      adminId: params.adminId,
      roadmapId: params.id,
    });

    return { deleted: true };
  }

  async addItemToRoadmap(params: {
    roadmapId: string;
    itemType: 'lesson' | 'problem';
    itemId: string;
    order?: number;
  }) {
    // [WARN-5] Validate roadmap exists
    const roadmap = await this.roadmapRepository.findById(params.roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    if (!params.itemId || params.itemId.trim().length === 0) {
      throw new AppException('Item ID is required', 400, 'INVALID_INPUT');
    }

    // [WARN-5] Validate that the referenced lesson or problem actually exists
    if (params.itemType === 'lesson') {
      const lesson = await this.lessonRepository.findById(params.itemId);
      if (!lesson) {
        throw new AppException('Lesson not found', 404, 'LESSON_NOT_FOUND');
      }
    } else {
      const problem = await this.problemRepository.findById(params.itemId);
      if (!problem) {
        throw new AppException('Problem not found', 404, 'PROBLEM_NOT_FOUND');
      }
    }

    // [WARN-3] Prevent duplicate items (same itemId + itemType in the same roadmap)
    const existingItems = await db
      .select({ id: roadmapItems.id })
      .from(roadmapItems)
      .where(
        and(
          eq(roadmapItems.roadmapId, params.roadmapId),
          eq(roadmapItems.itemType, params.itemType),
          eq(roadmapItems.itemId, params.itemId)
        )
      )
      .limit(1);

    if (existingItems.length > 0) {
      throw new AppException(
        'This item is already in the roadmap',
        409,
        'ITEM_ALREADY_EXISTS'
      );
    }

    // [WARN-4] Auto-calculate order as max(order) + 1 when not provided
    let order = params.order;
    if (order === undefined || order === null) {
      const maxResult = await db
        .select({ maxOrder: max(roadmapItems.order) })
        .from(roadmapItems)
        .where(eq(roadmapItems.roadmapId, params.roadmapId));

      order = (maxResult[0]?.maxOrder ?? 0) + 1;
    }

    const item = await this.roadmapRepository.addRoadmapItem({
      roadmapId: params.roadmapId,
      itemType: params.itemType,
      itemId: params.itemId,
      order,
    });

    logger.info({
      action: 'ADMIN_ROADMAP_ITEM_ADDED',
      roadmapId: params.roadmapId,
      itemType: params.itemType,
      itemId: params.itemId,
      order,
    });

    return item;
  }

  async removeItemFromRoadmap(params: { roadmapId: string; itemId: string }) {
    const roadmap = await this.roadmapRepository.findById(params.roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    const removed = await this.roadmapRepository.removeRoadmapItem(params.roadmapId, params.itemId);
    if (!removed) {
      throw new AppException('Item not found in roadmap', 404, 'ITEM_NOT_FOUND');
    }

    logger.info({
      action: 'ADMIN_ROADMAP_ITEM_REMOVED',
      roadmapId: params.roadmapId,
      itemId: params.itemId,
    });

    return { removed: true };
  }

  async reorderItems(roadmapId: string, adminId: string, itemIds: string[]) {
    const roadmap = await this.roadmapRepository.findById(roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    const result = await this.roadmapItemRepository.reorderItems(roadmapId, itemIds);

    logger.info({
      action: 'ADMIN_ROADMAP_ITEMS_REORDERED',
      adminId,
      roadmapId,
    });

    return result;
  }

  // [BUG-2] getAvailableItems moved from controller into service layer
  async getAvailableItems(): Promise<{
    lessons: Array<{ id: string; title: string; type: 'lesson' }>;
    problems: Array<{ id: string; title: string; type: 'problem' }>;
  }> {
    const [lessons, problems] = await Promise.all([
      this.lessonRepository.getAllLessons(),
      this.problemRepository.findAllProblems(1, 1000),
    ]);

    return {
      lessons: lessons.map((lesson: any) => ({
        id: lesson.id,
        title: lesson.title,
        type: 'lesson' as const,
      })),
      problems: (problems.data || []).map((problem: any) => ({
        id: problem.id,
        title: problem.title,
        type: 'problem' as const,
      })),
    };
  }
}

export function createAdminRoadmapService(): AdminRoadmapService {
  return new AdminRoadmapService(
    createRoadmapRepository(),
    new LessonRepository(),
    new ProblemRepository(),
    createRoadmapItemRepository()
  );
}
