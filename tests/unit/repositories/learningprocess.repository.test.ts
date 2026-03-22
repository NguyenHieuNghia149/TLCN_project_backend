import {
  createLearningProcessRepository,
  LearningProcessRepository,
} from '@backend/api/repositories/learningprocess.repository';
import { SubmissionRepository } from '@backend/api/repositories/submission.repository';
import { LearnedLessonRepository } from '@backend/api/repositories/learned-lesson.repository';
import { ProblemRepository } from '@backend/api/repositories/problem.repository';
import { LessonRepository } from '@backend/api/repositories/lesson.repository';
import { TopicRepository } from '@backend/api/repositories/topic.repository';
import { ESubmissionStatus } from '@backend/shared/types';

describe('LearningProcessRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('aggregates topic progress using the injected repositories', async () => {
    const submissionRepository = {
      findByUserId: jest.fn().mockResolvedValue({
        data: [
          {
            problemId: 'problem-1',
            status: ESubmissionStatus.ACCEPTED,
            submittedAt: new Date('2025-01-02T00:00:00.000Z'),
          },
          {
            problemId: 'problem-2',
            status: ESubmissionStatus.WRONG_ANSWER,
            submittedAt: new Date('2025-01-01T00:00:00.000Z'),
          },
        ],
      }),
    } as any;
    const topicRepository = {
      findMany: jest.fn().mockResolvedValue({
        data: [
          { id: 'topic-1', topicName: 'Arrays' },
          { id: 'topic-2', topicName: 'Graphs' },
        ],
      }),
    } as any;
    const problemRepository = {
      findMany: jest.fn().mockResolvedValue({
        data: [
          { id: 'problem-1', topicId: 'topic-1' },
          { id: 'problem-2', topicId: 'topic-1' },
          { id: 'problem-3', topicId: 'topic-2' },
        ],
      }),
    } as any;
    const repository = new LearningProcessRepository({
      submissionRepository,
      learnedLessonRepository: {} as any,
      problemRepository,
      lessonRepository: {} as any,
      topicRepository,
    });

    const result = await repository.getUserLearningProgress('user-1');

    expect(submissionRepository.findByUserId).toHaveBeenCalledWith('user-1', { limit: 1000 });
    expect(topicRepository.findMany).toHaveBeenCalledWith({ limit: 1000 });
    expect(problemRepository.findMany).toHaveBeenCalledWith({ limit: 5000 });
    expect(result).toMatchObject({
      userId: 'user-1',
      totalTopics: 2,
      totalProblems: 3,
      totalSolvedProblems: 1,
      overallCompletionPercentage: 33,
    });
    expect(result.topicProgress).toEqual([
      expect.objectContaining({
        topicId: 'topic-1',
        totalProblems: 2,
        solvedProblems: 1,
        completionPercentage: 50,
      }),
      expect.objectContaining({
        topicId: 'topic-2',
        totalProblems: 1,
        solvedProblems: 0,
        completionPercentage: 0,
      }),
    ]);
    expect(result.recentTopic?.topicId).toBe('topic-1');
  });

  it('builds lesson progress using the injected repositories', async () => {
    const learnedLessonRepository = {
      getCompletedLessonsByUser: jest.fn().mockResolvedValue([
        {
          lessonId: 'lesson-1',
          completedAt: new Date('2025-01-03T00:00:00.000Z'),
        },
      ]),
    } as any;
    const lessonRepository = {
      findMany: jest.fn().mockResolvedValue({
        data: [
          { id: 'lesson-1', title: 'Intro', topicId: 'topic-1' },
          { id: 'lesson-2', title: 'Prefix Sum', topicId: 'topic-1' },
        ],
      }),
      findById: jest.fn().mockResolvedValue({ id: 'lesson-1', title: 'Intro', topicId: 'topic-1' }),
      getLessonsByTopicId: jest.fn().mockResolvedValue([
        { id: 'lesson-1', title: 'Intro', topicId: 'topic-1' },
        { id: 'lesson-2', title: 'Prefix Sum', topicId: 'topic-1' },
      ]),
    } as any;
    const topicRepository = {
      findMany: jest.fn().mockResolvedValue({
        data: [{ id: 'topic-1', topicName: 'Arrays' }],
      }),
      findById: jest.fn().mockResolvedValue({ id: 'topic-1', topicName: 'Arrays' }),
    } as any;
    const repository = new LearningProcessRepository({
      submissionRepository: {} as any,
      learnedLessonRepository,
      problemRepository: {} as any,
      lessonRepository,
      topicRepository,
    });

    const result = await repository.getLessonProgress('user-1', 'lesson-1');

    expect(lessonRepository.findById).toHaveBeenCalledWith('lesson-1');
    expect(topicRepository.findById).toHaveBeenCalledWith('topic-1');
    expect(lessonRepository.getLessonsByTopicId).toHaveBeenCalledWith('topic-1');
    expect(result).toMatchObject({
      lessonId: 'lesson-1',
      topicId: 'topic-1',
      totalLessons: 2,
      completedLessons: 1,
      completionPercentage: 50,
    });
  });

  it('creates a repository wired with concrete nested repositories', () => {
    const repository = createLearningProcessRepository();

    expect(repository).toBeInstanceOf(LearningProcessRepository);
    expect((repository as any).submissionRepository).toBeInstanceOf(SubmissionRepository);
    expect((repository as any).learnedLessonRepository).toBeInstanceOf(LearnedLessonRepository);
    expect((repository as any).problemRepository).toBeInstanceOf(ProblemRepository);
    expect((repository as any).lessonRepository).toBeInstanceOf(LessonRepository);
    expect((repository as any).topicRepository).toBeInstanceOf(TopicRepository);
  });
});