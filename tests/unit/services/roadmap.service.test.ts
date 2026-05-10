import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoadmapService } from '../../../apps/api/src/services/roadmap.service';

/**
 * R14.9: Edge Case Tests for Sequential Unlocking
 * Tests prerequisite validation, lock status calculation, and item completion
 */
describe('RoadmapService - R14 Sequential Unlocking', () => {
  let service: RoadmapService;

  beforeEach(() => {
    service = new RoadmapService({} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getRoadmapDetailWithLockStatus - Lock Status Calculation', () => {
    it('should mark first item as unlocked regardless of completion', async () => {
      const mockItems = [
        { id: 'item-1', order: 0, itemTitle: 'Item 1', itemType: 'lesson' },
        { id: 'item-2', order: 1, itemTitle: 'Item 2', itemType: 'problem' },
      ];
      const mockRoadmap = { id: 'roadmap-1', title: 'Test Roadmap' };
      const completedSet = new Set<string>();

      jest.spyOn(service['roadmapRepository'], 'getById')
        .mockResolvedValue({ roadmap: mockRoadmap, items: mockItems });
      jest.spyOn(service['userItemCompletionRepository'], 'getCompletedItemsByUser')
        .mockResolvedValue([]);

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      const firstItem = result.items.find(i => i.order === 0);
      expect(firstItem?.isUnlocked).toBe(true);
    });

    it('should lock item N when item N-1 is not completed', async () => {
      const mockItems = [
        { id: 'item-1', order: 0, itemTitle: 'Item 1', itemType: 'lesson' },
        { id: 'item-2', order: 1, itemTitle: 'Item 2', itemType: 'problem' },
        { id: 'item-3', order: 2, itemTitle: 'Item 3', itemType: 'lesson' },
      ];
      const mockRoadmap = { id: 'roadmap-1', title: 'Test Roadmap' };
      // Only item-1 completed
      const completedIds = ['item-1'];

      jest.spyOn(service['roadmapRepository'], 'getById')
        .mockResolvedValue({ roadmap: mockRoadmap, items: mockItems });
      jest.spyOn(service['userItemCompletionRepository'], 'getCompletedItemsByUser')
        .mockResolvedValue(completedIds);

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      const item2 = result.items.find(i => i.order === 1);
      const item3 = result.items.find(i => i.order === 2);

      expect(item2?.isUnlocked).toBe(true); // Item 1 is completed
      expect(item3?.isUnlocked).toBe(false); // Item 2 is not completed
      expect(item3?.lockReason).toContain('Item 2');
    });

    it('should unlock item N when item N-1 is completed', async () => {
      const mockItems = [
        { id: 'item-1', order: 0, itemTitle: 'Item 1', itemType: 'lesson' },
        { id: 'item-2', order: 1, itemTitle: 'Item 2', itemType: 'problem' },
      ];
      const mockRoadmap = { id: 'roadmap-1', title: 'Test Roadmap' };
      const completedIds = ['item-1'];

      jest.spyOn(service['roadmapRepository'], 'getById')
        .mockResolvedValue({ roadmap: mockRoadmap, items: mockItems });
      jest.spyOn(service['userItemCompletionRepository'], 'getCompletedItemsByUser')
        .mockResolvedValue(completedIds);

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      const item2 = result.items.find(i => i.order === 1);
      expect(item2?.isUnlocked).toBe(true);
      expect(item2?.lockReason).toBeNull();
    });

    it('should set lockReason with correct prerequisite message', async () => {
      const mockItems = [
        { id: 'item-1', order: 0, itemTitle: 'Intro to JS', itemType: 'lesson' },
        { id: 'item-2', order: 1, itemTitle: 'Variables', itemType: 'problem' },
      ];
      const mockRoadmap = { id: 'roadmap-1', title: 'Test Roadmap' };

      jest.spyOn(service['roadmapRepository'], 'getById')
        .mockResolvedValue({ roadmap: mockRoadmap, items: mockItems });
      jest.spyOn(service['userItemCompletionRepository'], 'getCompletedItemsByUser')
        .mockResolvedValue([]);

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      const item2 = result.items.find(i => i.order === 1);
      expect(item2?.lockReason).toContain('Intro to JS');
      expect(item2?.lockReason).toMatch(/Complete ".*Intro to JS.*" first/);
    });
  });

  describe('completeRoadmapItem - Prerequisite Validation', () => {
    it('should allow completing first item without prerequisite', async () => {
      const mockItem = { id: 'item-1', order: 0, roadmapId: 'roadmap-1' };

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValue(mockItem);
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValue(false);
      jest.spyOn(service['userItemCompletionRepository'], 'markItemCompleted')
        .mockResolvedValue(true);

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'item-1')
      ).resolves.not.toThrow();
    });

    it('should reject completion if prerequisite item not completed', async () => {
      const mockItem = { id: 'item-2', order: 1, roadmapId: 'roadmap-1' };
      const mockPrevItem = { id: 'item-1', order: 0, roadmapId: 'roadmap-1' };

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValueOnce(mockItem)
        .mockResolvedValueOnce(mockPrevItem);
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValueOnce(false) // item-2 not completed
        .mockResolvedValueOnce(false); // item-1 not completed (prerequisite)

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'item-2')
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow completion if prerequisite item is completed', async () => {
      const mockItem = { id: 'item-2', order: 1, roadmapId: 'roadmap-1' };
      const mockPrevItem = { id: 'item-1', order: 0, roadmapId: 'roadmap-1' };

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValueOnce(mockItem);
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValueOnce(false) // item-2 not completed
        .mockResolvedValueOnce(true); // item-1 IS completed (prerequisite met)
      jest.spyOn(service['userItemCompletionRepository'], 'markItemCompleted')
        .mockResolvedValue(true);

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'item-2')
      ).resolves.not.toThrow();
    });

    it('should be idempotent - allow re-completing already completed item', async () => {
      const mockItem = { id: 'item-1', order: 0, roadmapId: 'roadmap-1' };

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValue(mockItem);
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValue(true); // Already completed

      // Should not throw, just return success
      const result = await service.completeRoadmapItem('user-1', 'roadmap-1', 'item-1');

      expect(result.item).toBeDefined();
    });

    it('should return unlocked next item when available', async () => {
      const mockItem = { id: 'item-1', order: 0, roadmapId: 'roadmap-1' };
      const mockNextItem = { id: 'item-2', order: 1, roadmapId: 'roadmap-1', itemTitle: 'Item 2' };

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValueOnce(mockItem);
      jest.spyOn(service['roadmapItemRepository'], 'getByOrderInRoadmap')
        .mockResolvedValue(mockNextItem);
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValue(false);
      jest.spyOn(service['userItemCompletionRepository'], 'markItemCompleted')
        .mockResolvedValue(true);

      const result = await service.completeRoadmapItem('user-1', 'roadmap-1', 'item-1');

      expect(result.unlockedNextItem).toBeDefined();
      expect(result.unlockedNextItem?.id).toBe('item-2');
    });

    it('should not return next item if completing last item', async () => {
      const mockItem = { id: 'item-3', order: 2, roadmapId: 'roadmap-1' };

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValue(mockItem);
      jest.spyOn(service['roadmapItemRepository'], 'getByOrderInRoadmap')
        .mockResolvedValue(null); // No next item
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValue(false);
      jest.spyOn(service['userItemCompletionRepository'], 'markItemCompleted')
        .mockResolvedValue(true);

      const result = await service.completeRoadmapItem('user-1', 'roadmap-1', 'item-3');

      expect(result.unlockedNextItem).toBeUndefined();
    });

    it('should throw 404 if item not found', async () => {
      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValue(null);

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'nonexistent-item')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 with specific code if prerequisite not met', async () => {
      const mockItem = { id: 'item-2', order: 1, roadmapId: 'roadmap-1' };

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValue(mockItem);
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false); // Prerequisite not met

      try {
        await service.completeRoadmapItem('user-1', 'roadmap-1', 'item-2');
        fail('Should have thrown BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          error: expect.stringContaining('PREREQUISITE'),
        });
      }
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle roadmap with many items correctly', async () => {
      const mockItems = Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        order: i,
        itemTitle: `Item ${i}`,
        itemType: i % 2 === 0 ? 'lesson' : 'problem',
      }));
      const mockRoadmap = { id: 'roadmap-1', title: 'Large Roadmap' };
      // User completed first 50 items
      const completedIds = Array.from({ length: 50 }, (_, i) => `item-${i}`);

      jest.spyOn(service['roadmapRepository'], 'getById')
        .mockResolvedValue({ roadmap: mockRoadmap, items: mockItems });
      jest.spyOn(service['userItemCompletionRepository'], 'getCompletedItemsByUser')
        .mockResolvedValue(completedIds);

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      // Item 50 should be unlocked (item 49 completed)
      const item50 = result.items.find(i => i.order === 50);
      expect(item50?.isUnlocked).toBe(true);

      // Item 51 should be locked (item 50 not completed)
      const item51 = result.items.find(i => i.order === 51);
      expect(item51?.isUnlocked).toBe(false);

      // Item 100 should be locked
      const item100 = result.items.find(i => i.order === 100);
      expect(item100?.isUnlocked).toBe(false);
    });

    it('should handle multiple users independently', async () => {
      const mockItem = { id: 'item-2', order: 1, roadmapId: 'roadmap-1' };

      // User 1 has completed item-1
      jest.spyOn(service['userItemCompletionRepository'], 'getCompletedItemsByUser')
        .mockResolvedValueOnce(['item-1'])
        .mockResolvedValueOnce([]); // User 2 has completed nothing

      jest.spyOn(service['roadmapItemRepository'], 'getById')
        .mockResolvedValue(mockItem);

      // User 1 should be able to complete item-2
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true); // item-1 completed for user-1

      await expect(
        service.completeRoadmapItem('user-1', 'roadmap-1', 'item-2')
      ).resolves.not.toThrow();

      // User 2 should not be able to complete item-2
      jest.spyOn(service['userItemCompletionRepository'], 'isItemCompletedByUser')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false); // item-1 NOT completed for user-2

      await expect(
        service.completeRoadmapItem('user-2', 'roadmap-1', 'item-2')
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle item with order=0 edge case', async () => {
      const mockItems = [
        { id: 'item-0', order: 0, itemTitle: 'First', itemType: 'lesson' },
      ];
      const mockRoadmap = { id: 'roadmap-1', title: 'Single Item' };

      jest.spyOn(service['roadmapRepository'], 'getById')
        .mockResolvedValue({ roadmap: mockRoadmap, items: mockItems });
      jest.spyOn(service['userItemCompletionRepository'], 'getCompletedItemsByUser')
        .mockResolvedValue([]);

      const result = await service.getRoadmapDetailWithLockStatus('roadmap-1', 'user-1');

      const item = result.items[0];
      expect(item.isUnlocked).toBe(true);
      expect(item.lockReason).toBeNull();
    });
  });
});
