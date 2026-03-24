import { FavoriteService, createFavoriteService } from '../../../apps/api/src/services/favorite.service';
import { FavoriteRepository } from '../../../apps/api/src/repositories/favorite.repository';
import { ProblemRepository } from '../../../apps/api/src/repositories/problem.repository';
import { TestcaseRepository } from '../../../apps/api/src/repositories/testcase.repository';
import { SubmissionRepository } from '../../../apps/api/src/repositories/submission.repository';
import { LessonRepository } from '../../../apps/api/src/repositories/lesson.repository';
import { ProblemVisibility } from '@backend/shared/types';

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
        visibility: ProblemVisibility.PUBLIC,
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

  it('rejects private problems when adding a favorite', async () => {
    const service = new FavoriteService(
      createFavoriteDependencies({
        favoriteRepository: {
          findByUserAndProblem: jest.fn().mockResolvedValue(null),
          addFavorite: jest.fn().mockResolvedValue({
            id: 'favorite-private',
            problemId: 'problem-private',
            createdAt: new Date(),
          }),
        },
        testcaseRepository: {
          sumPointsByProblemIds: jest.fn().mockResolvedValue({ 'problem-private': 0 }),
        },
        submissionRepository: {
          getAcceptedProblemIdsByUser: jest.fn().mockResolvedValue(new Set()),
        },
        problemRepository: {
          findById: jest.fn().mockResolvedValue({
            id: 'problem-private',
            title: 'Private',
            description: 'desc',
            difficult: 'easy',
            constraint: null,
            tags: 'tree',
            lessonId: null,
            topicId: null,
            visibility: ProblemVisibility.PRIVATE,
            createdAt: new Date(),
            updatedAt: new Date(),
            functionSignature: {
              name: 'inorderTraversal',
              args: [
                {
                  name: 'root',
                  type: {
                    type: 'array',
                    items: {
                      type: 'nullable',
                      value: { type: 'integer' },
                    },
                  },
                },
              ],
              returnType: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
          }),
        },
      }),
    );

    await expect(service.addFavorite('user-1', 'problem-private')).rejects.toThrow('Challenge not found');
  });

  it('filters private problems out of listUserFavorites', async () => {
    const favoriteRepository = {
      listFavoritesByUser: jest.fn().mockResolvedValue([
        {
          favorite: {
            id: 'favorite-public',
            problemId: 'problem-public',
            createdAt: new Date('2026-03-23T00:00:00.000Z'),
          },
          problem: {
            id: 'problem-public',
            title: 'Median of Two Sorted Arrays',
            description: 'desc',
            difficult: 'hard',
            constraint: null,
            tags: 'array,binary-search',
            lessonId: null,
            topicId: null,
            visibility: ProblemVisibility.PUBLIC,
            createdAt: new Date('2026-03-23T00:00:00.000Z'),
            updatedAt: new Date('2026-03-23T00:00:00.000Z'),
            functionSignature: {
              name: 'findMedianSortedArrays',
              args: [
                { name: 'nums1', type: 'array', items: 'integer' },
                { name: 'nums2', type: 'array', items: 'integer' },
              ],
              returnType: { type: 'number' },
            },
          },
        },
        {
          favorite: {
            id: 'favorite-private',
            problemId: 'problem-private',
            createdAt: new Date('2026-03-23T00:00:00.000Z'),
          },
          problem: {
            id: 'problem-private',
            title: 'Private',
            description: 'desc',
            difficult: 'easy',
            constraint: null,
            tags: 'private-only',
            lessonId: null,
            topicId: null,
            visibility: ProblemVisibility.PRIVATE,
            createdAt: new Date('2026-03-23T00:00:00.000Z'),
            updatedAt: new Date('2026-03-23T00:00:00.000Z'),
            functionSignature: {
              name: 'twoSum',
              args: [],
              returnType: { type: 'array', items: 'integer' },
            },
          },
        },
      ]),
    } as any;
    const testcaseRepository = {
      sumPointsByProblemIds: jest.fn().mockResolvedValue({ 'problem-public': 20 }),
    } as any;
    const submissionRepository = {
      getAcceptedProblemIdsByUser: jest.fn().mockResolvedValue(new Set(['problem-public'])),
    } as any;
    const service = new FavoriteService(
      createFavoriteDependencies({ favoriteRepository, testcaseRepository, submissionRepository }),
    );

    const result = await service.listUserFavorites('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.problemId).toBe('problem-public');
    expect(result[0]?.problem?.functionSignature).toEqual({
      name: 'findMedianSortedArrays',
      args: [
        {
          name: 'nums1',
          type: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
        {
          name: 'nums2',
          type: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
      ],
      returnType: { type: 'number' },
    });
    expect(testcaseRepository.sumPointsByProblemIds).toHaveBeenCalledWith(['problem-public']);
    expect(submissionRepository.getAcceptedProblemIdsByUser).toHaveBeenCalledWith('user-1', ['problem-public']);
  });

  it('rejects private problems when toggling a favorite', async () => {
    const service = new FavoriteService(
      createFavoriteDependencies({
        favoriteRepository: {
          findByUserAndProblem: jest.fn().mockResolvedValue(null),
          addFavorite: jest.fn().mockResolvedValue({
            id: 'favorite-private',
            problemId: 'problem-private',
            createdAt: new Date(),
          }),
        },
        testcaseRepository: {
          sumPointsByProblemIds: jest.fn().mockResolvedValue({ 'problem-private': 0 }),
        },
        submissionRepository: {
          getAcceptedProblemIdsByUser: jest.fn().mockResolvedValue(new Set()),
        },
        problemRepository: {
          findById: jest.fn().mockResolvedValue({
            id: 'problem-private',
            title: 'Private',
            description: 'desc',
            difficult: 'easy',
            constraint: null,
            tags: 'tree',
            lessonId: null,
            topicId: null,
            visibility: ProblemVisibility.PRIVATE,
            createdAt: new Date(),
            updatedAt: new Date(),
            functionSignature: {
              name: 'inorderTraversal',
              args: [],
              returnType: { type: 'array', items: 'integer' },
            },
          }),
        },
      }),
    );

    await expect(service.toggleFavorite('user-1', 'problem-private')).rejects.toThrow('Challenge not found');
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
