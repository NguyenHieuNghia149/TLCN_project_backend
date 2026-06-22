import { RoadmapService } from '@backend/api/services/roadmap.service';

function createMockRepos() {
  return {
    roadmapRepository: {
      getRoadmapDetail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteRoadmapCascade: jest.fn(),
      listRoadmaps: jest.fn(),
      countRoadmaps: jest.fn(),
      listUserRoadmaps: jest.fn(),
      countUserRoadmaps: jest.fn(),
    },
    roadmapItemRepository: {
      getMaxOrderByRoadmap: jest.fn(),
      addItemToRoadmap: jest.fn(),
      removeItemFromRoadmap: jest.fn(),
      compactOrdersAfterDelete: jest.fn(),
      reorderItems: jest.fn(),
    },
    roadmapProgressRepository: {
      getProgressByUserAndRoadmap: jest.fn().mockResolvedValue(null),
      markItemCompleted: jest.fn().mockResolvedValue(undefined),
      markItemIncomplete: jest.fn().mockResolvedValue(undefined),
      markItemCompletedInRoadmap: jest.fn().mockResolvedValue(undefined),
      getCompletionStats: jest.fn(),
      listProgressByUser: jest.fn(),
    },
    userItemCompletionRepository: {
      getCompletedItemsByUser: jest.fn().mockResolvedValue([]),
      isItemCompletedByUser: jest.fn(),
      markItemCompleted: jest.fn().mockResolvedValue({
        id: 'completion-1',
        userId: 'user-1',
        itemId: 'item-1',
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    lessonRepository: {
      findById: jest.fn(),
    },
    problemRepository: {
      findById: jest.fn(),
    },
  };
}

function createService() {
  const repos = createMockRepos();
  const service = new RoadmapService(repos as any);
  return { service, repos };
}

function createRoadmapDetail(items: Array<Record<string, unknown>>) {
  return {
    roadmap: {
      id: 'roadmap-1',
      title: 'Test Roadmap',
      createdBy: 'user-1',
      visibility: 'public',
    },
    items,
  };
}

describe('RoadmapService - sequential unlocking', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getRoadmapDetailWithLockStatus', () => {
    it('marks the first ordered item as unlocked', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
          { id: 'item-2', order: 2, itemTitle: 'Item 2', itemType: 'problem' },
        ]),
      );

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      expect(result.items[0]).toMatchObject({
        id: 'item-1',
        isCompleted: false,
        isUnlocked: true,
        lockReason: null,
      });
    });

    it('locks an item when the previous ordered item is incomplete', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Intro to JS', itemType: 'lesson' },
          { id: 'item-2', order: 2, itemTitle: 'Variables', itemType: 'problem' },
          { id: 'item-3', order: 3, itemTitle: 'Functions', itemType: 'lesson' },
        ]),
      );
      repos.userItemCompletionRepository.getCompletedItemsByUser.mockResolvedValue(['item-1']);

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      expect(result.items[1]).toMatchObject({
        id: 'item-2',
        isCompleted: false,
        isUnlocked: true,
        lockReason: null,
      });
      expect(result.items[2]).toMatchObject({
        id: 'item-3',
        isCompleted: false,
        isUnlocked: false,
        lockReason: 'Complete "Variables" first',
      });
    });

    it('merges item-completion and roadmap-progress completion sources', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
          { id: 'item-2', order: 2, itemTitle: 'Item 2', itemType: 'problem' },
          { id: 'item-3', order: 3, itemTitle: 'Item 3', itemType: 'lesson' },
        ]),
      );
      repos.userItemCompletionRepository.getCompletedItemsByUser.mockResolvedValue(['item-1']);
      repos.roadmapProgressRepository.getProgressByUserAndRoadmap.mockResolvedValue({
        completedItemIds: ['item-2'],
      });

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      expect(result.items[1]).toMatchObject({ id: 'item-2', isCompleted: true });
      expect(result.items[2]).toMatchObject({ id: 'item-3', isUnlocked: true });
    });

    it('rejects private roadmaps', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue({
        roadmap: {
          id: 'roadmap-1',
          title: 'Private Roadmap',
          createdBy: 'user-1',
          visibility: 'private',
        },
        items: [],
      });

      await expect(
        service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'ROADMAP_NOT_FOUND',
      });
    });
  });

  describe('visibility guards', () => {
    it('rejects getRoadmapById for private roadmaps', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue({
        roadmap: {
          id: 'roadmap-1',
          title: 'Private Roadmap',
          createdBy: 'user-1',
          visibility: 'private',
        },
        items: [],
      });

      await expect(service.getRoadmapById('roadmap-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'ROADMAP_NOT_FOUND',
      });
    });

    it('rejects getUserProgress for private roadmaps', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.findById.mockResolvedValue({
        id: 'roadmap-1',
        title: 'Private Roadmap',
        createdBy: 'user-1',
        visibility: 'private',
      });

      await expect(service.getUserProgress('user-1', 'roadmap-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'ROADMAP_NOT_FOUND',
      });
    });

    it('returns only public user roadmaps', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.listUserRoadmaps.mockResolvedValue([
        {
          id: 'roadmap-1',
          title: 'Public Roadmap',
          createdBy: 'user-1',
          visibility: 'public',
          itemCount: 3,
        },
      ]);
      repos.roadmapRepository.countUserRoadmaps.mockResolvedValue(1);

      await expect(
        service.listUserRoadmaps({ userId: 'user-1', limit: 20, offset: 0 }),
      ).resolves.toEqual({
        roadmaps: [
          {
            id: 'roadmap-1',
            title: 'Public Roadmap',
            createdBy: 'user-1',
            visibility: 'public',
            itemCount: 3,
          },
        ],
        total: 1,
      });
    });
  });

  describe('completeRoadmapItem', () => {
    it('allows completing the first item without a prerequisite', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
          { id: 'item-2', order: 2, itemTitle: 'Item 2', itemType: 'problem' },
        ]),
      );
      repos.userItemCompletionRepository.isItemCompletedByUser.mockResolvedValue(false);

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'item-1'),
      ).resolves.toMatchObject({
        item: { id: 'item-1', isCompleted: true, isUnlocked: true },
        unlockedNextItem: { id: 'item-2', isUnlocked: true },
      });
    });

    it('rejects completion when the previous item is incomplete', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
          { id: 'item-2', order: 2, itemTitle: 'Item 2', itemType: 'problem' },
        ]),
      );
      repos.userItemCompletionRepository.isItemCompletedByUser
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'item-2'),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'PREREQUISITE_NOT_MET',
      });
    });

    it('allows completion when the previous item is complete', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
          { id: 'item-2', order: 2, itemTitle: 'Item 2', itemType: 'problem' },
        ]),
      );
      repos.userItemCompletionRepository.getCompletedItemsByUser.mockResolvedValue(['item-1']);
      repos.userItemCompletionRepository.isItemCompletedByUser
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await service.completeRoadmapItem('user-1', 'roadmap-1', 'item-2');

      expect(result.item).toMatchObject({
        id: 'item-2',
        isCompleted: true,
        isUnlocked: true,
        lockReason: null,
      });
    });

    it('is idempotent for an already completed item', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
          { id: 'item-2', order: 2, itemTitle: 'Item 2', itemType: 'problem' },
        ]),
      );
      repos.userItemCompletionRepository.getCompletedItemsByUser.mockResolvedValue(['item-1']);
      repos.userItemCompletionRepository.isItemCompletedByUser.mockResolvedValue(true);

      const result = await service.completeRoadmapItem('user-1', 'roadmap-1', 'item-1');

      expect(result.item).toMatchObject({ id: 'item-1', isCompleted: true });
      expect(result.unlockedNextItem).toMatchObject({ id: 'item-2', isUnlocked: true });
    });

    it('omits unlockedNextItem when completing the last item', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
        ]),
      );
      repos.userItemCompletionRepository.isItemCompletedByUser.mockResolvedValue(false);

      const result = await service.completeRoadmapItem('user-1', 'roadmap-1', 'item-1');

      expect(result.unlockedNextItem).toBeUndefined();
    });

    it('throws ROADMAP_ITEM_NOT_FOUND when the item is absent from the roadmap', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue(
        createRoadmapDetail([
          { id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' },
        ]),
      );

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'missing-item'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'ROADMAP_ITEM_NOT_FOUND',
      });
    });

    it('rejects completion for private roadmaps', async () => {
      const { service, repos } = createService();
      repos.roadmapRepository.getRoadmapDetail.mockResolvedValue({
        roadmap: {
          id: 'roadmap-1',
          title: 'Private Roadmap',
          createdBy: 'user-1',
          visibility: 'private',
        },
        items: [{ id: 'item-1', order: 1, itemTitle: 'Item 1', itemType: 'lesson' }],
      });

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'item-1'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'ROADMAP_NOT_FOUND',
      });
    });
  });
});
