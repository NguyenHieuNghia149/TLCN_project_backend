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
import {
  createUserItemCompletionRepository,
  UserItemCompletionRepository,
} from '@backend/api/repositories/userItemCompletion.repository';
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
  userItemCompletionRepository: UserItemCompletionRepository;
  lessonRepository: LessonRepository;
  problemRepository: ProblemRepository;
};

export class RoadmapService {
  private roadmapRepository: RoadmapRepository;
  private roadmapItemRepository: RoadmapItemRepository;
  private roadmapProgressRepository: RoadmapProgressRepository;
  private userItemCompletionRepository: UserItemCompletionRepository;
  private lessonRepository: LessonRepository;
  private problemRepository: ProblemRepository;

  constructor(deps: RoadmapServiceDependencies) {
    this.roadmapRepository = deps.roadmapRepository;
    this.roadmapItemRepository = deps.roadmapItemRepository;
    this.roadmapProgressRepository = deps.roadmapProgressRepository;
    this.userItemCompletionRepository = deps.userItemCompletionRepository;
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

  /**
   * R14.3: Get roadmap detail with lock status for each item
   * Used by frontend to display sequential unlocking UI
   * Calculates: isCompleted, isUnlocked, lockReason for each item
   * 
   * Logic:
   * - Item 0: always unlocked
   * - Item N (N > 0): unlocked if Item(N-1) is in completedItems
   * - isCompleted: item in completedItems
   * - lockReason: "Complete {previous item title} first" if locked
   */
  async getRoadmapDetailWithLockStatus(roadmapId: string, userId: string) {
    const roadmapDetail = await this.roadmapRepository.getRoadmapDetail(roadmapId);
    if (!roadmapDetail) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    // Get user's completed items from BOTH sources to ensure data sync
    // 1. From userItemCompletions (item-level completion tracking)
    const itemIds = roadmapDetail.items.map(item => item.id);
    const completedFromUserItems = await this.userItemCompletionRepository.getCompletedItemsByUser(
      userId,
      itemIds
    );
    
    // 2. From roadmapProgress (aggregate completion tracking)
    const progress = await this.roadmapProgressRepository.getProgressByUserAndRoadmap(userId, roadmapId);
    const completedFromProgress = (progress?.completedItemIds ?? []) as string[];
    
    // Merge both sources to ensure no data is lost
    const completedItemIds = Array.from(new Set([...completedFromUserItems, ...completedFromProgress]));
    const completedSet = new Set(completedItemIds);

    // Sort items by order before calculating sequential lock state
    const orderedItems = [...roadmapDetail.items].sort((a, b) => a.order - b.order);

    // Calculate lock status for each item
    const itemsWithLockStatus = orderedItems.map((item, index) => {
      const isCompleted = completedSet.has(item.id);
      const isUnlocked = index === 0 || completedSet.has(orderedItems[index - 1]!.id);
      const previousItem = index > 0 ? orderedItems[index - 1] : null;
      const lockReason = !isUnlocked && previousItem ? `Complete "${previousItem.itemTitle}" first` : null;

      return {
        ...item,
        isCompleted,
        isUnlocked,
        lockReason,
      };
    });

    return {
      ...roadmapDetail,
      items: itemsWithLockStatus,
    };
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

    // R13.1 FIX: Query max order from DB instead of using items.length
    // This ensures order = max(order) + 1 always, preventing concurrent request conflicts
    const maxOrder = await this.roadmapItemRepository.getMaxOrderByRoadmap(input.roadmapId);
    const nextOrder = maxOrder + 1;

    return this.roadmapItemRepository.addItemToRoadmap({
      roadmapId: input.roadmapId,
      itemType: input.itemType,
      itemId: input.itemId,
      order: nextOrder,
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

    // R13.3: Compact order values to remove gaps after deletion
    await this.roadmapItemRepository.compactOrdersAfterDelete(roadmapId);
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

  /**
   * R14.4: Mark a roadmap item as completed by a user
   * Validates that the user has completed the prerequisite item (N-1) before allowing N to be marked complete
   * Returns the completion record and unlocked next item (if any)
   * 
   * Validation:
   * - If item order > 0, check that previous item is completed
   * - If not completed, throw 400 Bad Request
   * - Idempotent: if already completed, return success
   */
  async completeRoadmapItem(
    userId: string,
    roadmapId: string,
    itemId: string
  ): Promise<{ item: any; unlockedNextItem?: any }> {
    // 1. Get roadmap detail with enriched item data (includes itemTitle)
    const roadmapDetail = await this.roadmapRepository.getRoadmapDetail(roadmapId);
    if (!roadmapDetail) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    const item = roadmapDetail.items.find(i => i.id === itemId);
    if (!item) {
      throw new AppException('Roadmap item not found', 404, 'ROADMAP_ITEM_NOT_FOUND');
    }

    const itemIds = roadmapDetail.items.map(i => i.id);
    const userCompletedItemIds = await this.userItemCompletionRepository.getCompletedItemsByUser(
      userId,
      itemIds
    );
    const completedSet = new Set(userCompletedItemIds);

    // 2. Check if already completed (idempotent)
    const alreadyCompleted = await this.userItemCompletionRepository.isItemCompletedByUser(
      userId,
      itemId
    );
    if (alreadyCompleted) {
      await this.markItemCompleted(userId, roadmapId, itemId);

      const nextItem = roadmapDetail.items.find(i => i.order === item.order + 1);
      const unlockedNextItem = nextItem
        ? {
            ...nextItem,
            isCompleted: completedSet.has(nextItem.id),
            isUnlocked: true,
            lockReason: null,
          }
        : undefined;

      return {
        item: {
          ...item,
          isCompleted: true,
          isUnlocked: true,
          lockReason: null,
        },
        unlockedNextItem,
      };
    }

    // 3. Validate prerequisite: if order > 0, previous item must be completed
    if (item.order > 0) {
      const previousItem = roadmapDetail.items.find(i => i.order === item.order - 1);
      if (!previousItem) {
        throw new AppException(
          'Previous item not found (internal error)',
          500,
          'INTERNAL_ERROR'
        );
      }

      const prevCompleted = await this.userItemCompletionRepository.isItemCompletedByUser(
        userId,
        previousItem.id
      );
      if (!prevCompleted) {
        throw new AppException(
          `Complete "${previousItem.itemTitle || 'Item ' + previousItem.order}" first`,
          400,
          'PREREQUISITE_NOT_MET'
        );
      }
    }

    // 4. Mark as completed (create UserItemCompletion record)
    await this.userItemCompletionRepository.markItemCompleted(userId, itemId);
    await this.markItemCompleted(userId, roadmapId, itemId);

    // 5. Build enriched item response with lock status
    completedSet.add(item.id);
    const enrichedItem = {
      ...item,
      isCompleted: true,
      isUnlocked: true,
      lockReason: null,
    };

    // 6. Get next item (if exists) - now unlocked by completion
    const nextItem = roadmapDetail.items.find(i => i.order === item.order + 1);
    const unlockedNextItem = nextItem
      ? {
          ...nextItem,
          isCompleted: completedSet.has(nextItem.id),
          isUnlocked: true,
          lockReason: null,
        }
      : undefined;

    return { item: enrichedItem, unlockedNextItem };
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
    userItemCompletionRepository: createUserItemCompletionRepository(),
    lessonRepository: new LessonRepository(),
    problemRepository: new ProblemRepository(),
  });
}
