import { logger } from '@backend/shared/utils';
import { AppException } from '@backend/api/exceptions/base.exception';
import { createRoadmapRepository, RoadmapRepository } from '@backend/api/repositories/roadmap.repository';
import { createRoadmapProgressRepository, RoadmapProgressRepository } from '@backend/api/repositories/roadmapProgress.repository';

export class UserRoadmapSelectionService {
  constructor(
    private readonly roadmapRepository: RoadmapRepository,
    private readonly progressRepository: RoadmapProgressRepository
  ) {}

  async getUserRoadmapSelection(userId: string) {
    const progress = await this.progressRepository.findByUserAndRoadmap(userId);
    
    if (!progress) {
      return null;
    }

    const roadmap = await this.roadmapRepository.findById(progress.roadmapId);
    if (!roadmap) {
      return null;
    }

    return {
      id: progress.id,
      userId: progress.userId,
      roadmapId: progress.roadmapId,
      selectedAt: progress.updatedAt,
      startedAt: null,
      completedAt: null,
    };
  }

  async selectRoadmap(params: { userId: string; roadmapId: string }) {
    // Verify roadmap exists and is public
    const roadmap = await this.roadmapRepository.findById(params.roadmapId);
    if (!roadmap) {
      throw new AppException('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    if (roadmap.visibility !== 'public') {
      throw new AppException('Cannot select private roadmap', 403, 'FORBIDDEN');
    }

    // Create or update progress record
    let progress = await this.progressRepository.findByUserAndRoadmap(params.userId);

    if (!progress) {
      // Create new progress record
      progress = await this.progressRepository.create({
        userId: params.userId,
        roadmapId: params.roadmapId,
        completedItemIds: [],
      });
    } else {
      // Update existing record with new roadmap
      progress = await this.progressRepository.update(progress.id, {
        roadmapId: params.roadmapId,
      });
    }

    logger.info({
      action: 'USER_ROADMAP_SELECTED',
      userId: params.userId,
      roadmapId: params.roadmapId,
    });

    if (!progress) {
      throw new AppException('Failed to create roadmap selection', 500, 'INTERNAL_ERROR');
    }

    return {
      id: progress.id,
      userId: progress.userId,
      roadmapId: progress.roadmapId,
      selectedAt: progress.updatedAt,
      startedAt: null,
      completedAt: null,
    };
  }
}

export function createUserRoadmapSelectionService(): UserRoadmapSelectionService {
  return new UserRoadmapSelectionService(
    createRoadmapRepository(),
    createRoadmapProgressRepository()
  );
}
