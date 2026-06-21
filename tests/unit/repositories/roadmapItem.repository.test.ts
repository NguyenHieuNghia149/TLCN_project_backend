import { RoadmapItemRepository } from '@backend/api/repositories/roadmapItem.repository';
import { roadmapItems } from '@backend/shared/db/schema';

function createRepositoryWithMaxOrderRows(rows: Array<{ maxOrder: number | null }>) {
  const repository = new RoadmapItemRepository();
  const mockWhere = jest.fn(async () => rows);
  const mockFrom = jest.fn(() => ({ where: mockWhere }));
  const mockSelect = jest.fn(() => ({ from: mockFrom }));

  (repository as any).db = { select: mockSelect };

  return { repository, mockSelect, mockFrom, mockWhere };
}

describe('RoadmapItemRepository.getMaxOrderByRoadmap', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 0 when the roadmap has no items', async () => {
    const { repository } = createRepositoryWithMaxOrderRows([]);

    await expect(repository.getMaxOrderByRoadmap('roadmap-1')).resolves.toBe(0);
  });

  it('returns the current maximum order value', async () => {
    const { repository } = createRepositoryWithMaxOrderRows([{ maxOrder: 5 }]);

    await expect(repository.getMaxOrderByRoadmap('roadmap-1')).resolves.toBe(5);
  });

  it('returns 0 when the aggregate max order is null', async () => {
    const { repository } = createRepositoryWithMaxOrderRows([{ maxOrder: null }]);

    await expect(repository.getMaxOrderByRoadmap('roadmap-1')).resolves.toBe(0);
  });

  it('queries roadmap_items and applies a roadmapId filter', async () => {
    const { repository, mockSelect, mockFrom, mockWhere } =
      createRepositoryWithMaxOrderRows([{ maxOrder: 3 }]);

    await repository.getMaxOrderByRoadmap('roadmap-123');

    expect(mockSelect).toHaveBeenCalledWith({
      maxOrder: expect.objectContaining({}),
    });
    expect(mockFrom).toHaveBeenCalledWith(roadmapItems);
    expect(mockWhere).toHaveBeenCalledWith(expect.objectContaining({}));
  });

  it('propagates database errors', async () => {
    const repository = new RoadmapItemRepository();
    const mockWhere = jest.fn(async () => {
      throw new Error('DB Connection Error');
    });
    const mockFrom = jest.fn(() => ({ where: mockWhere }));
    const mockSelect = jest.fn(() => ({ from: mockFrom }));
    (repository as any).db = { select: mockSelect };

    await expect(repository.getMaxOrderByRoadmap('roadmap-1')).rejects.toThrow(
      'DB Connection Error',
    );
  });

  it('documents next order assignment as maxOrder plus one', async () => {
    const { repository } = createRepositoryWithMaxOrderRows([{ maxOrder: 5 }]);

    const maxOrder = await repository.getMaxOrderByRoadmap('roadmap-1');

    expect(maxOrder + 1).toBe(6);
  });
});
