import { FavoriteService, createFavoriteService } from '../../../apps/api/src/services/favorite.service';
import { FavoriteRepository } from '../../../apps/api/src/repositories/favorite.repository';
import { ProblemRepository } from '../../../apps/api/src/repositories/problem.repository';
import { TestcaseRepository } from '../../../apps/api/src/repositories/testcase.repository';
import { SubmissionRepository } from '../../../apps/api/src/repositories/submission.repository';
import { LessonRepository } from '../../../apps/api/src/repositories/lesson.repository';

/** Builds a dependency bag for FavoriteService tests with optional overrides. */
function createFavoriteDependencies(overrides: Partial<any> = {}) {
  return {
    favoriteRepository: {} as any,
    problemRepository: {} as any,
    testcaseRepository: {} as any,
    submissionRepository: {} as any,
    lessonRepository: {} as any,
    ...overrides,
  };
}

describe('FavoriteService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses injected repositories when adding a favorite', async () => {
    const favoriteRepository = {
      findByUserAndProblem: jest.fn().mockResolvedValue(null),
      addFavorite: jest.fn().mockResolvedValue({
        id: 'favorite-1',
        problemId: 'problem-1',
        createdAt: new Date(),
      }),
    } as any;
    const problemRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'problem-1',
        title: 'Two Sum',
        description: 'desc',
        difficult: 'easy',
        constraint: null,
        tags: 'array',
        lessonId: null,
        topicId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        functionSignature: {
          name: 'twoSum',
          args: [],
          returnType: { type: 'array', items: 'integer' },
        },
      }),
    } as any;
    const testcaseRepository = {
      sumPointsByProblemIds: jest.fn().mockResolvedValue({ 'problem-1': 10 }),
    } as any;
    const submissionRepository = {
      getAcceptedProblemIdsByUser: jest.fn().mockResolvedValue(new Set(['problem-1'])),
    } as any;
    const service = new FavoriteService(
      createFavoriteDependencies({
        favoriteRepository,
        problemRepository,
        testcaseRepository,
        submissionRepository,
      }),
    );

    const result = await service.addFavorite('user-1', 'problem-1');

    expect(problemRepository.findById).toHaveBeenCalledWith('problem-1');
    expect(favoriteRepository.findByUserAndProblem).toHaveBeenCalledWith('user-1', 'problem-1');
    expect(favoriteRepository.addFavorite).toHaveBeenCalledWith('user-1', 'problem-1');
    expect(testcaseRepository.sumPointsByProblemIds).toHaveBeenCalledWith(['problem-1']);
    expect(submissionRepository.getAcceptedProblemIdsByUser).toHaveBeenCalledWith('user-1', ['problem-1']);
    expect(result.problemId).toBe('problem-1');
  });

  it('uses injected repositories when removing a favorite', async () => {
    const favoriteRepository = {
      findByUserAndProblem: jest.fn().mockResolvedValue({ id: 'favorite-1' }),
      removeFavorite: jest.fn().mockResolvedValue(true),
    } as any;
    const service = new FavoriteService(createFavoriteDependencies({ favoriteRepository }));

    await service.removeFavorite('user-1', 'problem-1');

    expect(favoriteRepository.findByUserAndProblem).toHaveBeenCalledWith('user-1', 'problem-1');
    expect(favoriteRepository.removeFavorite).toHaveBeenCalledWith('user-1', 'problem-1');
  });

  it('uses injected repositories when adding a lesson favorite', async () => {
    const favoriteRepository = {
      findByUserAndLesson: jest.fn().mockResolvedValue(null),
      addLessonFavorite: jest.fn().mockResolvedValue({
        id: 'lesson-favorite-1',
        lessonId: 'lesson-1',
        createdAt: new Date(),
      }),
    } as any;
    const lessonRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'lesson-1',
        title: 'Arrays',
        content: 'Intro',
        videoUrl: null,
        topicId: 'topic-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as any;
    const service = new FavoriteService(
      createFavoriteDependencies({ favoriteRepository, lessonRepository }),
    );

    const result = await service.addLessonFavorite('user-1', 'lesson-1');

    expect(lessonRepository.findById).toHaveBeenCalledWith('lesson-1');
    expect(favoriteRepository.findByUserAndLesson).toHaveBeenCalledWith('user-1', 'lesson-1');
    expect(favoriteRepository.addLessonFavorite).toHaveBeenCalledWith('user-1', 'lesson-1');
    expect(result.lessonId).toBe('lesson-1');
  });

  it('creates a favorite service wired with concrete repositories', () => {
    const service = createFavoriteService();

    expect(service).toBeInstanceOf(FavoriteService);
    expect((service as any).favoriteRepository).toBeInstanceOf(FavoriteRepository);
    expect((service as any).problemRepository).toBeInstanceOf(ProblemRepository);
    expect((service as any).testcaseRepository).toBeInstanceOf(TestcaseRepository);
    expect((service as any).submissionRepository).toBeInstanceOf(SubmissionRepository);
    expect((service as any).lessonRepository).toBeInstanceOf(LessonRepository);
  });
});


