import { ChallengeService, createChallengeService } from '../../../apps/api/src/services/challenge.service';
import { TopicRepository } from '../../../apps/api/src/repositories/topic.repository';
import { ProblemRepository } from '../../../apps/api/src/repositories/problem.repository';
import { TestcaseRepository } from '../../../apps/api/src/repositories/testcase.repository';
import { SolutionRepository } from '../../../apps/api/src/repositories/solution.repository';
import { LessonRepository } from '../../../apps/api/src/repositories/lesson.repository';
import { SubmissionRepository } from '../../../apps/api/src/repositories/submission.repository';
import { SolutionApproachRepository } from '../../../apps/api/src/repositories/solutionApproach.repository';
import { FavoriteRepository } from '../../../apps/api/src/repositories/favorite.repository';
import { FunctionSignature } from '@backend/shared/types';

/** Builds a dependency bag for ChallengeService tests with optional overrides. */
function createChallengeDependencies(overrides: Partial<any> = {}) {
  return {
    topicRepository: {} as any,
    problemRepository: {} as any,
    testcaseRepository: {} as any,
    solutionRepository: {} as any,
    lessonRepository: {} as any,
    solutionApproachRepository: {} as any,
    submissionRepository: {} as any,
    favoriteRepository: {} as any,
    ...overrides,
  };
}

describe('ChallengeService derived testcase display', () => {
  const signature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses injected repositories when loading topic tags', async () => {
    const topicRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'topic-1' }),
    } as any;
    const problemRepository = {
      getTagsByTopicId: jest.fn().mockResolvedValue(['array', 'hash-table']),
    } as any;
    const service = new ChallengeService(
      createChallengeDependencies({ topicRepository, problemRepository }),
    );

    const result = await service.getTopicTags('topic-1');

    expect(topicRepository.findById).toHaveBeenCalledWith('topic-1');
    expect(problemRepository.getTagsByTopicId).toHaveBeenCalledWith('topic-1');
    expect(result).toEqual(['array', 'hash-table']);
  });

  it('derives testcase input and output from JSON instead of cached DB text', () => {
    const service = new ChallengeService(createChallengeDependencies());
    const response = (service as any).mapToChallengeResponse({
      problem: {
        id: 'problem-1',
        title: 'Two Sum',
        description: 'desc',
        difficult: 'easy',
        constraint: null,
        tags: 'array,hash-table',
        lessonId: null,
        topicId: null,
        isSolved: false,
        isFavorite: false,
        functionSignature: signature,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      testcases: [
        {
          id: 'testcase-1',
          inputJson: { nums: [2, 7, 11, 15], target: 9 },
          outputJson: [0, 1],
          input: 'stale input cache',
          output: 'stale output cache',
          isPublic: true,
          point: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      solution: null,
    });

    expect(response.testcases[0]).toMatchObject({
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
      input: 'nums: [2, 7, 11, 15]\ntarget: 9',
      output: '[0,1]',
    });
  });

  it('creates a challenge service wired with concrete repositories', () => {
    const service = createChallengeService();

    expect(service).toBeInstanceOf(ChallengeService);
    expect((service as any).topicRepository).toBeInstanceOf(TopicRepository);
    expect((service as any).problemRepository).toBeInstanceOf(ProblemRepository);
    expect((service as any).testcaseRepository).toBeInstanceOf(TestcaseRepository);
    expect((service as any).solutionRepository).toBeInstanceOf(SolutionRepository);
    expect((service as any).lessonRepository).toBeInstanceOf(LessonRepository);
    expect((service as any).solutionApproachRepository).toBeInstanceOf(SolutionApproachRepository);
    expect((service as any).submissionRepository).toBeInstanceOf(SubmissionRepository);
    expect((service as any).favoriteRepository).toBeInstanceOf(FavoriteRepository);
  });
});
