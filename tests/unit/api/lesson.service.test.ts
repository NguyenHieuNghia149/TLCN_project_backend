import { LessonService, createLessonService } from '@backend/api/services/lesson.service';
import { LessonRepository } from '@backend/api/repositories/lesson.repository';
import { TopicRepository } from '@backend/api/repositories/topic.repository';
import { FavoriteRepository } from '@backend/api/repositories/favorite.repository';

describe('LessonService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repositories to compute lesson favorites after topic filtering', async () => {
    const lessonRepository = {
      getAllLessons: jest.fn().mockResolvedValue([
        { id: 'lesson-1', topicId: 'topic-a', title: 'Lesson 1' },
        { id: 'lesson-2', topicId: 'topic-b', title: 'Lesson 2' },
        { id: 'lesson-3', topicId: 'topic-a', title: 'Lesson 3' },
      ]),
    } as any;
    const topicRepository = {} as any;
    const favoriteRepository = {
      getFavoriteLessonIds: jest.fn().mockResolvedValue(new Set(['lesson-3'])),
    } as any;
    const service = new LessonService({
      lessonRepository,
      topicRepository,
      favoriteRepository,
    });

    const result = await service.getAllLessons('user-1', 'topic-a');

    expect(lessonRepository.getAllLessons).toHaveBeenCalledTimes(1);
    expect(favoriteRepository.getFavoriteLessonIds).toHaveBeenCalledWith('user-1', [
      'lesson-1',
      'lesson-3',
    ]);
    expect(result).toEqual([
      { id: 'lesson-1', topicId: 'topic-a', title: 'Lesson 1', isFavorite: false },
      { id: 'lesson-3', topicId: 'topic-a', title: 'Lesson 3', isFavorite: true },
    ]);
  });

  it('uses the injected topic repository while creating a lesson', async () => {
    const topicRepository = {
      findById: jest
        .fn()
        .mockResolvedValueOnce({ id: 'topic-1', topicName: 'Arrays' })
        .mockResolvedValueOnce({ id: 'topic-1', topicName: 'Arrays' }),
    } as any;
    const lessonRepository = {
      createLesson: jest.fn().mockResolvedValue({
        id: 'lesson-1',
        title: 'Two Pointers',
        content: 'content',
        videoUrl: null,
        topicId: 'topic-1',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    } as any;
    const favoriteRepository = {} as any;
    const service = new LessonService({
      lessonRepository,
      topicRepository,
      favoriteRepository,
    });

    const result = await service.createLesson({
      title: 'Two Pointers',
      content: 'content',
      videoUrl: '',
      topicId: 'topic-1',
    });

    expect(topicRepository.findById).toHaveBeenCalledWith('topic-1');
    expect(lessonRepository.createLesson).toHaveBeenCalledWith({
      title: 'Two Pointers',
      content: 'content',
      videoUrl: null,
      topicId: 'topic-1',
    });
    expect(result).toMatchObject({
      id: 'lesson-1',
      topicName: 'Arrays',
      isFavorite: false,
    });
  });

  it('creates a service wired with concrete lesson dependencies', () => {
    const service = createLessonService();

    expect(service).toBeInstanceOf(LessonService);
    expect((service as any).lessonRepository).toBeInstanceOf(LessonRepository);
    expect((service as any).topicRepository).toBeInstanceOf(TopicRepository);
    expect((service as any).favoriteRepository).toBeInstanceOf(FavoriteRepository);
  });
});