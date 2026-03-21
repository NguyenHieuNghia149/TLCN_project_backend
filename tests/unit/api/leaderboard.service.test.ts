import { LeaderboardService, createLeaderboardService } from '@backend/api/services/leaderboard.service';
import { LeaderboardRepository } from '@backend/api/repositories/leaderboard.repository';

describe('LeaderboardService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('normalizes pagination before querying the injected repository', async () => {
    const entries = [
      {
        id: 'user-1',
        email: 'leader@example.com',
        firstName: 'Leader',
        lastName: 'One',
        avatar: null,
        rankingPoint: 500,
        submissionCount: 3,
        rank: 1,
      },
    ];
    const leaderboardRepository = {
      getLeaderboard: jest.fn().mockResolvedValue(entries),
      getLeaderboardTotal: jest.fn().mockResolvedValue(45),
    } as any;
    const service = new LeaderboardService({ leaderboardRepository });

    const result = await service.getLeaderboard(0, 101, 'leader');

    expect(leaderboardRepository.getLeaderboard).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      searchQuery: 'leader',
    });
    expect(leaderboardRepository.getLeaderboardTotal).toHaveBeenCalledWith('leader');
    expect(result).toMatchObject({
      entries,
      page: 1,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
    });
  });

  it('calculates percentile from injected leaderboard data', async () => {
    const leaderboardRepository = {
      getUserRank: jest.fn().mockResolvedValue({
        id: 'user-26',
        email: 'ranked@example.com',
        firstName: 'Ranked',
        lastName: 'User',
        avatar: null,
        rankingPoint: 260,
        submissionCount: 12,
        rank: 26,
      }),
      getLeaderboardTotal: jest.fn().mockResolvedValue(100),
    } as any;
    const service = new LeaderboardService({ leaderboardRepository });

    const result = await service.getUserRank('user-26');

    expect(leaderboardRepository.getUserRank).toHaveBeenCalledWith('user-26');
    expect(leaderboardRepository.getLeaderboardTotal).toHaveBeenCalledWith();
    expect(result).toMatchObject({
      id: 'user-26',
      rank: 26,
      percentile: 75,
    });
  });

  it('creates a service wired with a concrete leaderboard repository', () => {
    const service = createLeaderboardService();

    expect(service).toBeInstanceOf(LeaderboardService);
    expect((service as any).leaderboardRepository).toBeInstanceOf(LeaderboardRepository);
  });
});