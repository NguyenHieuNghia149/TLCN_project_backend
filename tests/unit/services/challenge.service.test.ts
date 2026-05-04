import { ChallengeService, createChallengeService } from '../../../apps/api/src/services/challenge.service';
import { TopicRepository } from '../../../apps/api/src/repositories/topic.repository';
import { ProblemRepository } from '../../../apps/api/src/repositories/problem.repository';
import { TestcaseRepository } from '../../../apps/api/src/repositories/testcase.repository';
import { SolutionRepository } from '../../../apps/api/src/repositories/solution.repository';
import { LessonRepository } from '../../../apps/api/src/repositories/lesson.repository';
import { SubmissionRepository } from '../../../apps/api/src/repositories/submission.repository';
import { SolutionApproachRepository } from '../../../apps/api/src/repositories/solutionApproach.repository';
import { FavoriteRepository } from '../../../apps/api/src/repositories/favorite.repository';
import { FunctionSignature, ProblemVisibility } from '@backend/shared/types';

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
    supportedLanguageRepository: {
      findActiveExecutableLanguages: jest.fn().mockResolvedValue([]),
    } as any,
    ...overrides,
  };
}

describe('ChallengeService derived testcase display', () => {
  const legacySignature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  const treeSignature: FunctionSignature = {
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
  };

  const nestedOutputSignature: FunctionSignature = {
    name: 'threeSum',
    args: [
      {
        name: 'nums',
        type: {
          type: 'array',
          items: { type: 'integer' },
        },
      },
    ],
    returnType: {
      type: 'array',
      items: {
        type: 'array',
        items: { type: 'integer' },
      },
    },
  };

  const numberSignature: FunctionSignature = {
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
        functionSignature: legacySignature,
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

  it('formats tree-array testcase input with nulls from recursive signatures', () => {
    const service = new ChallengeService(createChallengeDependencies());
    const response = (service as any).mapToChallengeResponse({
      problem: {
        id: 'problem-tree',
        title: 'Binary Tree Inorder Traversal',
        description: 'desc',
        difficult: 'easy',
        constraint: null,
        tags: 'tree',
        lessonId: null,
        topicId: null,
        isSolved: false,
        isFavorite: false,
        functionSignature: treeSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      testcases: [
        {
          id: 'testcase-tree',
          inputJson: { root: [1, null, 2, 3] },
          outputJson: [1, 3, 2],
          isPublic: true,
          point: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      solution: null,
    });

    expect(response.testcases[0]).toMatchObject({
      input: 'root: [1, null, 2, 3]',
      output: '[1,3,2]',
    });
  });

  it('formats nested outputs from recursive signatures', () => {
    const service = new ChallengeService(createChallengeDependencies());
    const response = (service as any).mapToChallengeResponse({
      problem: {
        id: 'problem-nested',
        title: '3Sum',
        description: 'desc',
        difficult: 'medium',
        constraint: null,
        tags: 'array,two-pointers',
        lessonId: null,
        topicId: null,
        isSolved: false,
        isFavorite: false,
        functionSignature: nestedOutputSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      testcases: [
        {
          id: 'testcase-nested',
          inputJson: { nums: [-1, 0, 1, 2, -1, -4] },
          outputJson: [[-1, -1, 2], [-1, 0, 1]],
          isPublic: true,
          point: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      solution: null,
    });

    expect(response.testcases[0]).toMatchObject({
      input: 'nums: [-1, 0, 1, 2, -1, -4]',
      output: '[[-1,-1,2],[-1,0,1]]',
    });
  });

  it('formats number outputs from recursive signatures', () => {
    const service = new ChallengeService(createChallengeDependencies());
    const response = (service as any).mapToChallengeResponse({
      problem: {
        id: 'problem-number',
        title: 'Median of Two Sorted Arrays',
        description: 'desc',
        difficult: 'hard',
        constraint: null,
        tags: 'array,binary-search',
        lessonId: null,
        topicId: null,
        isSolved: false,
        isFavorite: false,
        functionSignature: numberSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      testcases: [
        {
          id: 'testcase-number',
          inputJson: { nums1: [1, 2], nums2: [3, 4] },
          outputJson: 2.5,
          isPublic: true,
          point: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      solution: null,
    });

    expect(response.testcases[0]).toMatchObject({
      input: 'nums1: [1, 2]\nnums2: [3, 4]',
      output: '2.5',
    });
  });

  it('rejects private problems on the normal challenge detail path', async () => {
    const problemRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'private-problem',
        title: 'Private',
        description: 'desc',
        difficult: 'easy',
        constraint: null,
        tags: 'tree',
        lessonId: null,
        topicId: null,
        visibility: ProblemVisibility.PRIVATE,
        functionSignature: treeSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as any;
    const testcaseRepository = {
      findPublicByProblemId: jest.fn().mockResolvedValue([]),
      findByProblemId: jest.fn(),
    } as any;
    const solutionRepository = {
      findByProblemId: jest.fn().mockResolvedValue(null),
    } as any;
    const solutionApproachRepository = {
      findBySolutionId: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new ChallengeService(
      createChallengeDependencies({
        problemRepository,
        testcaseRepository,
        solutionRepository,
        solutionApproachRepository,
      }),
    );

    await expect(service.getChallengeById('private-problem')).rejects.toThrow(
      'Challenge with ID private-problem not found.',
    );
  });

  it('allows the elevated challenge detail path to load private problems', async () => {
    const problemRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'private-problem',
        title: 'Private',
        description: 'desc',
        difficult: 'easy',
        constraint: null,
        tags: 'tree',
        lessonId: null,
        topicId: null,
        visibility: ProblemVisibility.PRIVATE,
        functionSignature: treeSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as any;
    const testcaseRepository = {
      findByProblemId: jest.fn().mockResolvedValue([
        {
          id: 'testcase-tree',
          inputJson: { root: [1, null, 2, 3] },
          outputJson: [1, 3, 2],
          isPublic: false,
          point: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      findPublicByProblemId: jest.fn(),
    } as any;
    const solutionRepository = {
      findByProblemId: jest.fn().mockResolvedValue(null),
    } as any;
    const solutionApproachRepository = {
      findBySolutionId: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new ChallengeService(
      createChallengeDependencies({
        problemRepository,
        testcaseRepository,
        solutionRepository,
        solutionApproachRepository,
      }),
    );

    const result = await service.getChallengeById('private-problem', undefined, {
      showAllTestcases: true,
    });

    expect(testcaseRepository.findByProblemId).toHaveBeenCalledWith('private-problem');
    expect(testcaseRepository.findPublicByProblemId).not.toHaveBeenCalled();
    expect(result.problem.id).toBe('private-problem');
  });

  it('allows exam workspace access to private problems without exposing private testcases', async () => {
    const problemRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'private-problem',
        title: 'Private',
        description: 'desc',
        difficult: 'easy',
        constraint: null,
        tags: 'tree',
        lessonId: null,
        topicId: null,
        visibility: ProblemVisibility.PRIVATE,
        functionSignature: treeSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as any;
    const testcaseRepository = {
      findByProblemId: jest.fn().mockResolvedValue([
        {
          id: 'hidden-case',
          inputJson: { root: [1] },
          outputJson: [1],
          isPublic: false,
          point: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      findPublicByProblemId: jest.fn().mockResolvedValue([
        {
          id: 'public-case',
          inputJson: { root: [1] },
          outputJson: [1],
          isPublic: true,
          point: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    } as any;
    const solutionRepository = {
      findByProblemId: jest.fn().mockResolvedValue(null),
    } as any;
    const solutionApproachRepository = {
      findBySolutionId: jest.fn().mockResolvedValue([]),
    } as any;
    const submissionRepository = {
      getAcceptedProblemIdsByUser: jest.fn().mockResolvedValue(new Set<string>()),
    } as any;
    const favoriteRepository = {
      isFavorite: jest.fn().mockResolvedValue(false),
    } as any;
    const service = new ChallengeService(
      createChallengeDependencies({
        problemRepository,
        testcaseRepository,
        solutionRepository,
        solutionApproachRepository,
        submissionRepository,
        favoriteRepository,
      }),
    );

    const result = await service.getChallengeById('private-problem', 'user-1', {
      allowPrivateVisibility: true,
      showAllTestcases: false,
    });

    expect(testcaseRepository.findPublicByProblemId).toHaveBeenCalledWith('private-problem');
    expect(testcaseRepository.findByProblemId).not.toHaveBeenCalled();
    expect(result.problem.id).toBe('private-problem');
    expect(result.testcases).toHaveLength(1);
    expect(result.testcases[0]?.id).toBe('public-case');
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

describe('ChallengeService multilingual solution approach support', () => {
  const baseSignature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  const baseChallengeInput = {
    title: 'Two Sum',
    description: 'desc',
    difficulty: 'easy',
    constraint: 'constraint',
    tags: ['array'],
    functionSignature: baseSignature,
    testcases: [
      {
        inputJson: { nums: [2, 7, 11, 15], target: 9 },
        outputJson: [0, 1],
        isPublic: true,
        point: 10,
      },
    ],
  } as any;

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('rejects challenge creation when an approach is missing active executable languages', async () => {
    const topicRepository = { findById: jest.fn() } as any;
    const lessonRepository = { findById: jest.fn() } as any;
    const problemRepository = {
      createProblemTransactional: jest.fn(),
    } as any;
    const supportedLanguageRepository = {
      findActiveExecutableLanguages: jest.fn().mockResolvedValue([
        { key: 'cpp' },
        { key: 'java' },
        { key: 'python' },
      ]),
    } as any;
    const service = new ChallengeService({
      ...createChallengeDependencies({ topicRepository, lessonRepository, problemRepository }),
      supportedLanguageRepository,
    } as any);

    await expect(
      service.createChallenge({
        ...baseChallengeInput,
        solution: {
          title: 'Reference Solution',
          solutionApproaches: [
            {
              title: 'Brute Force',
              description: 'shared explanation',
              codeVariants: [{ language: 'cpp', sourceCode: 'cpp code' }],
              order: 1,
            },
          ],
        },
      }),
    ).rejects.toThrow('Missing solution code for active languages: java, python');

    expect(problemRepository.createProblemTransactional).not.toHaveBeenCalled();
  });

  it('maps multilingual codeVariants into the challenge response', () => {
    const service = new ChallengeService(createChallengeDependencies() as any);
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
        functionSignature: baseSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      testcases: [],
      solution: {
        id: 'solution-1',
        title: 'Reference Solution',
        description: 'shared explanation',
        videoUrl: null,
        imageUrl: null,
        isVisible: true,
        solutionApproaches: [
          {
            id: 'approach-1',
            title: 'Brute Force',
            description: 'shared explanation',
            codeVariants: [
              { language: 'cpp', sourceCode: 'cpp code' },
              { language: 'java', sourceCode: 'java code' },
            ],
            timeComplexity: 'O(n^2)',
            spaceComplexity: 'O(1)',
            explanation: 'details',
            order: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    expect(response.solution?.solutionApproaches[0]).toMatchObject({
      codeVariants: [
        { language: 'cpp', sourceCode: 'cpp code' },
        { language: 'java', sourceCode: 'java code' },
      ],
    });
    expect(response.solution?.solutionApproaches[0]).not.toHaveProperty('language');
    expect(response.solution?.solutionApproaches[0]).not.toHaveProperty('sourceCode');
  });

  it('does not require language coverage when updating solution metadata without solutionApproaches', async () => {
    const problemRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'problem-1',
        title: 'Two Sum',
        description: 'desc',
        difficult: 'easy',
        constraint: 'constraint',
        tags: 'array',
        lessonId: null,
        topicId: null,
        visibility: ProblemVisibility.PUBLIC,
        functionSignature: baseSignature,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({ id: 'problem-1' }),
      updateSolutionTransactional: jest.fn().mockResolvedValue(undefined),
    } as any;
    const submissionRepository = {
      findByProblemId: jest.fn().mockResolvedValue({ data: [] }),
    } as any;
    const testcaseRepository = {
      findByProblemId: jest.fn().mockResolvedValue([]),
    } as any;
    const solutionRepository = {
      findByProblemId: jest.fn().mockResolvedValue(null),
    } as any;
    const favoriteRepository = { isFavorite: jest.fn().mockResolvedValue(false) } as any;
    const supportedLanguageRepository = {
      findActiveExecutableLanguages: jest.fn(),
    } as any;
    const service = new ChallengeService({
      ...createChallengeDependencies({
        problemRepository,
        submissionRepository,
        testcaseRepository,
        solutionRepository,
        favoriteRepository,
      }),
      supportedLanguageRepository,
    } as any);
    jest.spyOn(service as any, 'getChallengeById').mockResolvedValue({ problem: {}, testcases: [], solution: null });

    await service.updateChallenge('problem-1', {
      solution: {
        title: 'Updated title',
        description: 'Updated description',
        isVisible: true,
      },
    } as any);

    expect(supportedLanguageRepository.findActiveExecutableLanguages).not.toHaveBeenCalled();
    expect(problemRepository.updateSolutionTransactional).toHaveBeenCalledWith('problem-1', {
      title: 'Updated title',
      description: 'Updated description',
      isVisible: true,
    });
  });
});


