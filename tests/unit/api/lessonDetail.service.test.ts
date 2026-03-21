import {
  LessonDetailService,
  createLessonDetailService,
} from '@backend/api/services/lessonDetail.service';
import { LessonDetailRepository } from '@backend/api/repositories/lessonDetail.repository';
import { LessonRepository } from '@backend/api/repositories/lesson.repository';

describe('LessonDetailService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected lesson repository in getAllLessons without dynamic import', async () => {
    const lessonDetailRepository = {} as any;
    const lessonRepository = {
      getAllLessons: jest.fn().mockResolvedValue([
        {
          id: 'lesson-1',
          title: 'Arrays',
          content: 'Intro',
          topicId: 'topic-1',
          topicName: 'Basics',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ]),
    } as any;
    const service = new LessonDetailService({ lessonDetailRepository, lessonRepository });

    const result = await service.getAllLessons();

    expect(lessonRepository.getAllLessons).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: 'lesson-1',
        title: 'Arrays',
        content: 'Intro',
        videoUrl: null,
        topicId: 'topic-1',
        topicName: 'Basics',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('creates a service wired with concrete lesson detail repositories', () => {
    const service = createLessonDetailService();

    expect(service).toBeInstanceOf(LessonDetailService);
    expect((service as any).lessonDetailRepository).toBeInstanceOf(LessonDetailRepository);
    expect((service as any).lessonRepository).toBeInstanceOf(LessonRepository);
  });
});
