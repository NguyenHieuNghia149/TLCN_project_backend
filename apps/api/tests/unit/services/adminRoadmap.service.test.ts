import { AdminRoadmapService } from '@backend/api/services/admin/adminRoadmap.service';
import type { RoadmapRepository } from '@backend/api/repositories/roadmap.repository';
import type { LessonRepository } from '@backend/api/repositories/lesson.repository';
import type { ProblemRepository } from '@backend/api/repositories/problem.repository';

// Helper: create a minimal mock repo set
function createMockRepos() {
  const roadmapRepo = {
    adminListRoadmaps: jest.fn().mockResolvedValue([]),
    adminCountRoadmaps: jest.fn().mockResolvedValue(0),
    adminGetRoadmapDetail: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deleteRoadmapCascade: jest.fn(),
    addRoadmapItem: jest.fn(),
    removeRoadmapItem: jest.fn(),
    create: jest.fn(),
  } as unknown as RoadmapRepository;

  const lessonRepo = {
    getAllLessons: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
  } as unknown as LessonRepository;

  const problemRepo = {
    findAllProblems: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findById: jest.fn().mockResolvedValue(null),
  } as unknown as ProblemRepository;

  return { roadmapRepo, lessonRepo, problemRepo };
}

// ─── listRoadmaps ────────────────────────────────────────────────────────────

describe('AdminRoadmapService.listRoadmaps', () => {
  it('clamps limit to 100 and offsets negative to 0', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await service.listRoadmaps({
      limit: 999,
      offset: -10,
      keyword: 'abc',
      visibility: 'public',
      createdAtFrom: '2026-01-01T00:00:00.000Z',
      createdAtTo: '2026-01-02T00:00:00.000Z',
    });

    expect((roadmapRepo as any).adminListRoadmaps).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, offset: 0, keyword: 'abc', visibility: 'public' })
    );
    expect((roadmapRepo as any).adminCountRoadmaps).toHaveBeenCalled();
  });

  it('throws INVALID_DATE when createdAtFrom is not a valid date string', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.listRoadmaps({ limit: 20, offset: 0, createdAtFrom: 'not-a-date' })
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
  });
});

// ─── createRoadmap ───────────────────────────────────────────────────────────

describe('AdminRoadmapService.createRoadmap', () => {
  it('throws INVALID_INPUT when title is empty', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.createRoadmap({ title: '  ', createdBy: 'user-id' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('creates a roadmap and returns it', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    const fakeRoadmap = { id: 'r1', title: 'Test' };
    (roadmapRepo as any).create.mockResolvedValue(fakeRoadmap);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);
    const result = await service.createRoadmap({ title: 'Test', createdBy: 'admin-1' });

    expect(result).toEqual(fakeRoadmap);
    expect((roadmapRepo as any).create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test', createdBy: 'admin-1' })
    );
  });
});

// ─── deleteRoadmap ───────────────────────────────────────────────────────────

describe('AdminRoadmapService.deleteRoadmap', () => {
  it('throws ROADMAP_NOT_FOUND when roadmap does not exist', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).deleteRoadmapCascade.mockResolvedValue(false);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.deleteRoadmap({ id: 'non-existent', adminId: 'admin-1' })
    ).rejects.toMatchObject({ code: 'ROADMAP_NOT_FOUND' });
  });

  it('returns { deleted: true } on success', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).deleteRoadmapCascade.mockResolvedValue(true);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);
    const result = await service.deleteRoadmap({ id: 'r1', adminId: 'admin-1' });

    expect(result).toEqual({ deleted: true });
  });
});

// ─── addItemToRoadmap ────────────────────────────────────────────────────────

jest.mock('@backend/shared/db/connection', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

describe('AdminRoadmapService.addItemToRoadmap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws ROADMAP_NOT_FOUND when roadmap does not exist', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).findById.mockResolvedValue(null);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.addItemToRoadmap({ roadmapId: 'r1', itemType: 'lesson', itemId: 'l1' })
    ).rejects.toMatchObject({ code: 'ROADMAP_NOT_FOUND' });
  });

  it('throws LESSON_NOT_FOUND when lesson does not exist', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).findById.mockResolvedValue({ id: 'r1' });
    (lessonRepo as any).findById.mockResolvedValue(null);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.addItemToRoadmap({ roadmapId: 'r1', itemType: 'lesson', itemId: 'l-nonexistent' })
    ).rejects.toMatchObject({ code: 'LESSON_NOT_FOUND' });
  });

  it('throws PROBLEM_NOT_FOUND when problem does not exist', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).findById.mockResolvedValue({ id: 'r1' });
    (problemRepo as any).findById.mockResolvedValue(null);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.addItemToRoadmap({ roadmapId: 'r1', itemType: 'problem', itemId: 'p-nonexistent' })
    ).rejects.toMatchObject({ code: 'PROBLEM_NOT_FOUND' });
  });
});

// ─── removeItemFromRoadmap ───────────────────────────────────────────────────

describe('AdminRoadmapService.removeItemFromRoadmap', () => {
  it('throws ROADMAP_NOT_FOUND when roadmap does not exist', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).findById.mockResolvedValue(null);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.removeItemFromRoadmap({ roadmapId: 'r1', itemId: 'item-1' })
    ).rejects.toMatchObject({ code: 'ROADMAP_NOT_FOUND' });
  });

  it('throws ITEM_NOT_FOUND when item is not in the roadmap', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).findById.mockResolvedValue({ id: 'r1' });
    (roadmapRepo as any).removeRoadmapItem.mockResolvedValue(false);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);

    await expect(
      service.removeItemFromRoadmap({ roadmapId: 'r1', itemId: 'item-nonexistent' })
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
  });

  it('returns { removed: true } on success', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (roadmapRepo as any).findById.mockResolvedValue({ id: 'r1' });
    (roadmapRepo as any).removeRoadmapItem.mockResolvedValue(true);

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);
    const result = await service.removeItemFromRoadmap({ roadmapId: 'r1', itemId: 'item-1' });

    expect(result).toEqual({ removed: true });
  });
});

// ─── getAvailableItems ───────────────────────────────────────────────────────

describe('AdminRoadmapService.getAvailableItems', () => {
  it('returns mapped lessons and problems', async () => {
    const { roadmapRepo, lessonRepo, problemRepo } = createMockRepos();
    (lessonRepo as any).getAllLessons.mockResolvedValue([{ id: 'l1', title: 'Lesson 1' }]);
    (problemRepo as any).findAllProblems.mockResolvedValue({
      data: [{ id: 'p1', title: 'Problem 1' }],
      total: 1,
    });

    const service = new AdminRoadmapService(roadmapRepo, lessonRepo, problemRepo);
    const result = await service.getAvailableItems();

    expect(result.lessons).toEqual([{ id: 'l1', title: 'Lesson 1', type: 'lesson' }]);
    expect(result.problems).toEqual([{ id: 'p1', title: 'Problem 1', type: 'problem' }]);
  });
});
